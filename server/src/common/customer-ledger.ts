import { unitTotalsOf } from './domain/units.ts'
import { found } from './scope.ts'
import { type Allocation, type UnitTotal } from '@huazhong/shared'
import { asc, eq, and, inArray, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import {
  allocations,
  receipts,
  refunds,
  orders,
  orderLines,
  afters,
  stores,
} from '../../db/schema/index.ts'
import type { Viewer } from './domain/viewer.ts'
interface SalesLedgerReader {
  shippedOrders(executor: Db | Tx, customerIds: readonly number[]): Promise<LedgerShippedOrder[]>
}
import { replayLedger, toArCard } from './domain/ledger.ts'
import { actors, ownActions, ledgerToken } from './ledger.ts'

export async function loadLedgers(
  executor: Db | Tx,
  sales: SalesLedgerReader,
  customerIds: readonly number[],
) {
  const result = new Map<number, Ledger>()
  for (const customerId of customerIds)
    result.set(customerId, await loadLedger(executor, sales, customerId))
  return result
}
export async function loadLedger(
  executor: Db | Tx,
  sales: SalesLedgerReader | null,
  customerId: number,
) {
  const shipped = await (sales
    ? sales.shippedOrders(executor, [customerId])
    : shippedLedgerOrders(executor, [customerId]))
  const money = await executor
    .select()
    .from(receipts)
    .where(eq(receipts.customerId, customerId))
    .orderBy(asc(receipts.createdAt), asc(receipts.id))
  const allocationRows = await customerAllocationRows(executor, customerId)
  const refundRows = await executor
    .select({ refund: refunds })
    .from(refunds)
    .innerJoin(receipts, eq(receipts.id, refunds.receiptId))
    .where(eq(receipts.customerId, customerId))
    .orderBy(asc(refunds.createdAt), asc(refunds.id))
  return customerLedgerView({
    customerId,
    shipped,
    money,
    allocationRows,
    refundList: refundRows.map((row) => row.refund),
  })
}

async function customerAllocationRows(executor: Db | Tx, customerId: number) {
  const rows = await executor
    .select({
      allocation: allocations,
      receiptNo: receipts.no,
      receiptStatus: receipts.status,
      orderNo: orders.no,
    })
    .from(allocations)
    .innerJoin(receipts, eq(receipts.id, allocations.receiptId))
    .innerJoin(orders, eq(orders.id, allocations.orderId))
    .where(eq(receipts.customerId, customerId))
    .orderBy(asc(allocations.createdAt), asc(allocations.id))
  return rows.map((row) => ({
    ...row.allocation,
    receiptNo: row.receiptNo,
    receiptStatus: row.receiptStatus,
    orderNo: row.orderNo,
  }))
}

function customerLedgerView(data: {
  customerId: number
  shipped: LedgerShippedOrder[]
  money: (typeof receipts.$inferSelect)[]
  allocationRows: Awaited<ReturnType<typeof customerAllocationRows>>
  refundList: (typeof refunds.$inferSelect)[]
}) {
  const { customerId, shipped, money, allocationRows, refundList } = data
  const replay = replayLedger(
    shipped,
    money.filter((row) => row.status === 'valid'),
    allocationRows.filter((row) => row.receiptStatus === 'valid' && row.revokedAt === null),
    refundList
      .filter((row) => row.status === 'valid')
      .map((row) => ({ receiptId: row.receiptId ?? 0, amountCents: row.amountCents })),
  )
  const cards = shipped
    .map((order) => ({ order, card: toArCard(order, replay.received.get(order.orderId) ?? 0) }))
    .sort(
      (a, b) =>
        b.order.shipDate.localeCompare(a.order.shipDate) || b.order.orderId - a.order.orderId,
    )
  return {
    customerId,
    orders: shipped,
    receipts: money,
    allocations: allocationRows,
    refunds: refundList,
    replay,
    cards,
    prepaidCents: [...replay.left.values()].reduce((sum, value) => sum + value, 0),
    token: ledgerToken({ shipped, money, allocationRows, refundList }),
  }
}
export type Ledger = Awaited<ReturnType<typeof loadLedger>>
export type LedgerAllocationRow = Ledger['allocations'][number]
export async function effectiveAllocations(
  ledger: Ledger,
  keep: (allocation: LedgerAllocationRow) => boolean,
  executor: Db | Tx,
  viewer?: Viewer,
): Promise<Allocation[]> {
  const people = await actors(
    executor,
    ledger.allocations.flatMap((row) => [row.createdBy, row.revokedBy]),
  )
  return ledger.allocations.filter(keep).map((row) => ({
    id: String(row.id),
    receiptId: String(row.receiptId),
    receiptNo: row.receiptNo,
    orderId: String(row.orderId),
    orderNo: row.orderNo,
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    createdBy: found(people.get(row.createdBy)),
    registeredCents: row.amountCents,
    effectiveCents: ledger.replay.effective.get(row.id) ?? 0,
    status: row.revokedAt === null ? ('valid' as const) : ('revoked' as const),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy: row.revokedBy === null ? null : (people.get(row.revokedBy) ?? null),
    revokeReason: row.revokeReason,
    actions:
      row.revokedAt === null && row.receiptStatus === 'valid'
        ? ownActions(viewer, row.createdBy, 'revokeAllocation')
        : [],
  }))
}

export interface LedgerShippedOrder {
  version: number
  orderId: number
  orderNo: string
  customerId: number
  storeId: number
  storeName: string
  shipDate: string
  units: UnitTotal[]
  shippedCents: number
  afterCents: number
}

// 每张发货单按单位合计的实发（卡片第 2 行）
async function unitsOf(executor: Db | Tx, orderIds: readonly number[]) {
  const units = new Map<number, UnitTotal[]>()
  if (orderIds.length === 0) return units
  const lines = await executor
    .select({ orderId: orderLines.orderId, unit: orderLines.unit, qty: orderLines.shippedQty })
    .from(orderLines)
    .where(inArray(orderLines.orderId, [...orderIds]))
    .orderBy(orderLines.orderId, orderLines.sort)
  for (const orderId of orderIds) {
    const own = lines.filter((line) => line.orderId === orderId)
    units.set(orderId, unitTotalsOf(own.map((line) => ({ unit: line.unit, qty: line.qty ?? 0 }))))
  }
  return units
}

export async function shippedLedgerOrders(
  executor: Db | Tx,
  customerIds: readonly number[],
): Promise<LedgerShippedOrder[]> {
  if (customerIds.length === 0) return []
  const shipped = executor
    .select({
      total: sql<number>`coalesce(sum(${orderLines.shippedQty} * ${orderLines.priceCents}), 0)::int`,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orders.id))
  const aftered = executor
    .select({ total: sql<number>`coalesce(sum(${afters.amountCents}), 0)::int` })
    .from(afters)
    .where(and(eq(afters.orderId, orders.id), eq(afters.status, 'processed')))
  const rows = await executor
    .select({
      orderId: orders.id,
      version: orders.version,
      orderNo: orders.no,
      customerId: orders.customerId,
      storeId: orders.storeId,
      storeName: stores.name,
      shipDate: orders.shipDate,
      shippedCents: sql<number>`(${shipped})`,
      afterCents: sql<number>`(${aftered})`,
    })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(and(inArray(orders.customerId, [...customerIds]), eq(orders.status, 'shipped')))
    .orderBy(asc(orders.id))
  const units = await unitsOf(
    executor,
    rows.map((row) => row.orderId),
  )
  return rows.map((row) => ({
    ...row,
    shipDate: row.shipDate ?? '',
    units: units.get(row.orderId) ?? [],
  }))
}
