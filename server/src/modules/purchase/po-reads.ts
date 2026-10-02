import {
  contract,
  shanghaiDateOf,
  copy,
  type Action,
  type PoCard,
  type PoDetail,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  accounts,
  poChanges,
  priceChanges,
  purchaseOrderLines,
  purchaseOrders,
  purchaseReturnLines,
  purchaseReturns,
  suppliers,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import { unitTotalsOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { poExtras } from './po-detail.ts'
import { loadPaymentLedger } from '../../common/payment-ledger.ts'
import { paymentHistory } from '../../common/finance-history.ts'
import { owns } from '../../common/ledger.ts'

type Executor = Db | Tx
type PoQuery = ParsedInput<typeof contract.listPurchaseOrders>['query']
const totals = {
  amountCents:
    sql<number>`coalesce((SELECT sum(qty::bigint * order_price_cents) FROM purchase_order_lines WHERE po_id = ${purchaseOrders.id}), 0)`.mapWith(
      Number,
    ),
  payableCents:
    sql<number>`CASE WHEN ${purchaseOrders.status} = 'received' THEN coalesce((SELECT sum((received_qty - returned_qty)::bigint * price_cents) FROM purchase_order_lines WHERE po_id = ${purchaseOrders.id}), 0) ELSE 0 END`.mapWith(
      Number,
    ),
  changed: sql<boolean>`EXISTS (SELECT 1 FROM po_changes WHERE po_id = ${purchaseOrders.id})`,
  repriced: sql<boolean>`EXISTS (SELECT 1 FROM price_changes WHERE po_id = ${purchaseOrders.id})`,
  allReturned: sql<boolean>`${purchaseOrders.status} = 'received' AND NOT EXISTS (SELECT 1 FROM purchase_order_lines WHERE po_id = ${purchaseOrders.id} AND received_qty <> returned_qty)`,
  liveAllocation: sql<boolean>`EXISTS (SELECT 1 FROM payment_allocations a JOIN payments p ON p.id = a.payment_id WHERE a.po_id = ${purchaseOrders.id} AND a.revoked_at IS NULL AND p.status = 'valid')`,
}
function rowsQuery(executor: Executor) {
  return executor
    .select({
      po: purchaseOrders,
      supplierName: suppliers.name,
      buyerName: accounts.name,
      ...totals,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .innerJoin(accounts, eq(accounts.id, purchaseOrders.buyerId))
}
type PoRow = Awaited<ReturnType<typeof rowsQuery>>[number]
type Line = typeof purchaseOrderLines.$inferSelect

function purchaseActions(row: PoRow, viewer: Viewer): Action[] {
  const actions: Action[] = []
  if (row.po.status === 'to_receive' && viewer.modules.includes('purchase')) {
    actions.push(enabledAction('editPo', true))
    if (owns(viewer, row.po.buyerId)) actions.push(enabledAction('cancelPo', true))
    if (row.po.inviteId === null) actions.push(enabledAction('changeSupplier', null))
  }
  if (
    viewer.type === 'supplier' &&
    row.po.inviteId !== null &&
    row.po.status === 'to_receive' &&
    viewer.supplierId === row.po.supplierId
  )
    actions.push(enabledAction('supplierEditPo', false), enabledAction('supplierCancelPo', true))
  return actions
}
function actionsOf(row: PoRow, viewer: Viewer): Action[] {
  const actions = purchaseActions(row, viewer)
  if (!viewer.modules.includes('warehouse')) return actions
  if (row.po.status === 'to_receive') actions.push(enabledAction('receive', false))
  if (row.po.status === 'received' && !row.allReturned) {
    actions.push(enabledAction('return', false), enabledAction('reprice', true))
  }
  if (
    row.po.status === 'received' &&
    !row.liveAllocation &&
    owns(viewer, row.po.receivedBy ?? row.po.createdBy)
  )
    actions.push(enabledAction('voidPo', true))
  return actions
}
async function cardOf(
  row: PoRow,
  lines: Line[],
  viewer: Viewer,
  executor: Executor,
): Promise<PoCard> {
  const ledger = await loadPaymentLedger(executor, row.po.supplierId)
  const paidCents = ledger.replay.received.get(row.po.id) ?? 0
  const unpaidCents = Math.max(row.payableCents - paidCents, 0)
  const { po } = row
  return {
    id: String(po.id),
    no: po.no,
    version: po.version,
    orderDate: po.orderDate,
    status: po.status,
    supplierId: String(po.supplierId),
    supplierName: row.supplierName,
    buyerName: row.buyerName,
    units: unitTotalsOf(lines),
    amountCents: row.amountCents,
    payableCents: row.payableCents,
    paidCents,
    unpaidCents,
    apStatus:
      row.payableCents === 0
        ? 'no_pay'
        : unpaidCents === 0
          ? 'paid'
          : paidCents > 0
            ? 'partial'
            : 'unpaid',
    changed: row.changed,
    repriced: row.repriced,
    allReturned: row.allReturned,
    actions: actionsOf(row, viewer),
    lockedReason: null,
  }
}
function scopeOf(viewer: Viewer): SQL | undefined {
  return viewer.type === 'supplier'
    ? eq(purchaseOrders.supplierId, viewer.supplierId ?? 0)
    : undefined
}
async function lineRows(executor: Executor, ids: number[]) {
  if (ids.length === 0) return []
  return executor
    .select()
    .from(purchaseOrderLines)
    .where(inArray(purchaseOrderLines.poId, ids))
    .orderBy(asc(purchaseOrderLines.sort), asc(purchaseOrderLines.id))
}

async function recordsOf(executor: Executor, poId: number) {
  const changes = await executor
    .select()
    .from(poChanges)
    .where(eq(poChanges.poId, poId))
    .orderBy(asc(poChanges.createdAt), asc(poChanges.id))
  const prices = await executor
    .select()
    .from(priceChanges)
    .where(eq(priceChanges.poId, poId))
    .orderBy(asc(priceChanges.createdAt), asc(priceChanges.id))
  const returns = await executor
    .select()
    .from(purchaseReturns)
    .where(eq(purchaseReturns.poId, poId))
    .orderBy(asc(purchaseReturns.createdAt), asc(purchaseReturns.id))
  const returnLines =
    returns.length === 0
      ? []
      : await executor
          .select()
          .from(purchaseReturnLines)
          .where(
            inArray(
              purchaseReturnLines.returnId,
              returns.map((row) => row.id),
            ),
          )
  const toRecord = (row: { id: number; actorLabel: string; createdAt: Date }) => ({
    id: String(row.id),
    actorLabel: row.actorLabel,
    createdAt: row.createdAt.toISOString(),
  })
  return {
    changes: changes.map((row) => ({ ...toRecord(row), reason: row.reason, items: row.items })),
    priceChanges: prices.map((row) => ({ ...toRecord(row), reason: row.reason, items: row.items })),
    returns: returns.map((row) => ({
      ...toRecord(row),
      items: returnLines
        .filter((line) => line.returnId === row.id)
        .map((line) => ({ name: line.name, qty: line.qty })),
    })),
  }
}

@Injectable()
export class PoReads {
  constructor(@Inject(DB) private readonly db: Db) {}
  supplierView(detail: PoDetail): OutputOf<typeof contract.supplierPurchaseOrder> {
    return {
      ...detail,
      allocations: detail.allocations
        .filter((row) => row.status === 'valid' && row.effectiveCents > 0)
        .map((row) => ({
          date: shanghaiDateOf(Date.parse(row.createdAt)),
          amountCents: row.effectiveCents,
        })),
    }
  }
  get(viewer: Viewer, id: number) {
    return this.db.transaction((tx) => this.detail(tx, viewer, id), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }

  async cards(executor: Executor, viewer: Viewer, where?: SQL): Promise<PoCard[]> {
    const rows = await rowsQuery(executor)
      .where(and(where, scopeOf(viewer)))
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id))
    const lines = await lineRows(
      executor,
      rows.map((row) => row.po.id),
    )
    return Promise.all(
      rows.map((row) =>
        cardOf(
          row,
          lines.filter((line) => line.poId === row.po.id),
          viewer,
          executor,
        ),
      ),
    )
  }
  private async waitingCount(base: SQL | undefined) {
    const [waiting] = await this.db
      .select({ total: count() })
      .from(purchaseOrders)
      .where(and(base, eq(purchaseOrders.status, 'to_receive')))
    return waiting?.total ?? 0
  }
  async list(
    viewer: Viewer,
    query: PoQuery,
  ): Promise<OutputOf<typeof contract.listPurchaseOrders>> {
    const warehouseOnly =
      viewer.modules.includes('warehouse') &&
      !viewer.modules.includes('purchase') &&
      !viewer.modules.includes('finance')
    const base = and(
      scopeOf(viewer),
      dateBetween(purchaseOrders.orderDate, query),
      query.supplierId ? eq(purchaseOrders.supplierId, Number(query.supplierId)) : undefined,
    )
    const rows = await rowsQuery(this.db)
      .where(
        and(
          base,
          query.status
            ? eq(purchaseOrders.status, query.status)
            : warehouseOnly
              ? ne(purchaseOrders.status, 'cancelled')
              : undefined,
          beforeCursor(purchaseOrders.orderDate, purchaseOrders.id, query.cursor),
        ),
      )
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.po.orderDate, row.po.id])
    const lines = await lineRows(
      this.db,
      page.items.map((row) => row.po.id),
    )
    const waiting = await this.waitingCount(base)
    return {
      items: await Promise.all(
        page.items.map((row) =>
          cardOf(
            row,
            lines.filter((line) => line.poId === row.po.id),
            viewer,
            this.db,
          ),
        ),
      ),
      nextCursor: page.nextCursor,
      actions: viewer.modules.includes('purchase') ? [enabledAction('create', null)] : [],
      counts: { to_receive: waiting },
    }
  }
  async detail(executor: Executor, viewer: Viewer, poId: number): Promise<PoDetail> {
    const [row] = await rowsQuery(executor).where(and(eq(purchaseOrders.id, poId), scopeOf(viewer)))
    const current = found(row)
    const lines = await lineRows(executor, [poId])
    return {
      ...(await cardOf(current, lines, viewer, executor)),
      ...(await recordsOf(executor, poId)),
      ...(await poExtras(executor, current.po, lines)),
      note: orNull(current.po.note),
      recvNote: orNull(current.po.recvNote),
      cancelReason: current.po.cancelReason,
      cancelledAt: current.po.cancelledAt?.toISOString() ?? null,
      notice: current.repriced && !current.liveAllocation ? copy.finance.repriceNotice : null,
      allocations: await paymentHistory(
        executor,
        await loadPaymentLedger(executor, current.po.supplierId),
        viewer,
      ).then((rows) => rows.filter((row) => row.docType === 'po' && row.docId === String(poId))),
      voidReason: current.po.voidReason,
      voidedAt: current.po.voidedAt?.toISOString() ?? null,
    }
  }
}
