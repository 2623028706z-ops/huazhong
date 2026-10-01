// 客户的应收账：发货单（销售模块给）+ 有效收款 + 没撤回的核销，一次查完再按登记顺序重算（04 章第 8 节）
import { appError, type AllocKind, type ArCard } from '@huazhong/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { allocations, receipts } from '../../../db/schema/index.ts'
import type { SalesService } from '../sales/sales.service.ts'
import {
  replayLedger,
  toArCard,
  type LedgerAllocation,
  type LedgerOrder,
  type LedgerReceipt,
  type Replay,
} from './domain/ar.ts'

type Executor = Db | Tx

export interface LedgerAllocationRow extends LedgerAllocation {
  receiptNo: string
  kind: AllocKind
  createdAt: Date
}

export interface Ledger {
  customerId: number
  orders: LedgerOrder[]
  receipts: LedgerReceipt[]
  allocations: LedgerAllocationRow[]
  replay: Replay
  // 发货单卡片，按出货日期、单号 id 倒序
  cards: { order: LedgerOrder; card: ArCard }[]
  prepaidCents: number
}

function sumValues(map: ReadonlyMap<number, number>): number {
  let total = 0
  for (const value of map.values()) total += value
  return total
}

// 这些客户的有效收款，按 (receipt_date, id)
function validReceipts(executor: Executor, customerIds: readonly number[]) {
  return executor
    .select({
      id: receipts.id,
      no: receipts.no,
      customerId: receipts.customerId,
      receiptDate: receipts.receiptDate,
      amountCents: receipts.amountCents,
    })
    .from(receipts)
    .where(and(inArray(receipts.customerId, [...customerIds]), eq(receipts.status, 'valid')))
    .orderBy(asc(receipts.receiptDate), asc(receipts.id))
}

// 所属收款有效、没撤回的核销，按 (created_at, id)
function liveAllocations(executor: Executor, customerIds: readonly number[]) {
  return executor
    .select({
      id: allocations.id,
      receiptId: allocations.receiptId,
      receiptNo: receipts.no,
      customerId: receipts.customerId,
      orderId: allocations.orderId,
      amountCents: allocations.amountCents,
      kind: allocations.kind,
      createdAt: allocations.createdAt,
    })
    .from(allocations)
    .innerJoin(receipts, eq(receipts.id, allocations.receiptId))
    .where(
      and(
        inArray(receipts.customerId, [...customerIds]),
        eq(receipts.status, 'valid'),
        isNull(allocations.revokedAt),
      ),
    )
    .orderBy(asc(allocations.createdAt), asc(allocations.id))
}

function ledgerOf(
  customerId: number,
  orders: LedgerOrder[],
  own: LedgerReceipt[],
  allocs: LedgerAllocationRow[],
): Ledger {
  const replay = replayLedger(orders, own, allocs)
  const cards = orders
    .map((order) => ({ order, card: toArCard(order, replay.received.get(order.orderId) ?? 0) }))
    .sort(
      (a, b) =>
        b.order.shipDate.localeCompare(a.order.shipDate) || b.order.orderId - a.order.orderId,
    )
  return {
    customerId,
    orders,
    receipts: own,
    allocations: allocs,
    replay,
    cards,
    prepaidCents: sumValues(replay.left),
  }
}

export async function loadLedgers(
  executor: Executor,
  sales: SalesService,
  customerIds: readonly number[],
): Promise<Map<number, Ledger>> {
  const ledgers = new Map<number, Ledger>()
  if (customerIds.length === 0) return ledgers
  const shipped = await sales.shippedOrders(executor, customerIds)
  const receiptRows = await validReceipts(executor, customerIds)
  const allocRows = await liveAllocations(executor, customerIds)
  for (const customerId of customerIds) {
    ledgers.set(
      customerId,
      ledgerOf(
        customerId,
        shipped.filter((order) => order.customerId === customerId),
        receiptRows.filter((row) => row.customerId === customerId),
        allocRows.filter((row) => row.customerId === customerId),
      ),
    )
  }
  return ledgers
}

export async function loadLedger(
  executor: Executor,
  sales: SalesService,
  customerId: number,
): Promise<Ledger> {
  const ledger = (await loadLedgers(executor, sales, [customerId])).get(customerId)
  if (!ledger) throw appError.internal()
  return ledger
}

// 生效的核销（售后后来冲减应收时按登记顺序重算，≤ 0 的不列）
export function effectiveAllocations(
  ledger: Ledger,
  keep: (alloc: LedgerAllocationRow) => boolean,
) {
  const orderNo = new Map(ledger.orders.map((order) => [order.orderId, order.orderNo]))
  return ledger.allocations.filter(keep).flatMap((alloc) => {
    const amountCents = ledger.replay.effective.get(alloc.id)
    if (amountCents === undefined) return []
    return [
      {
        id: String(alloc.id),
        receiptId: String(alloc.receiptId),
        receiptNo: alloc.receiptNo,
        orderId: String(alloc.orderId),
        orderNo: orderNo.get(alloc.orderId) ?? '',
        kind: alloc.kind,
        createdAt: alloc.createdAt.toISOString(),
        amountCents,
      },
    ]
  })
}
