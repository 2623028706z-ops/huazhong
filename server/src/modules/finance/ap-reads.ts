import {
  contract,
  copy,
  TODO_PREVIEW_COUNT,
  shanghaiDateOf,
  type OutputOf,
  type ApCard,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { suppliers, purchaseOrders } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { decodeCursor, pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { PurchaseService } from '../purchase/purchase.service.ts'
import { loadPaymentLedger } from '../../common/payment-ledger.ts'
import { refundView } from '../../common/finance-history.ts'
type Query = ParsedInput<typeof contract.getFinanceSupplier>['query']
function documentDates(docs: Awaited<ReturnType<typeof loadPaymentLedger>>['docs']) {
  return new Map(
    docs.map((doc) => [
      String(doc.id),
      doc.receivedAt ? shanghaiDateOf(doc.receivedAt.getTime()) : doc.orderDate,
    ]),
  )
}
function totals(cards: readonly ApCard[], prepaidCents: number) {
  return {
    payableCents: cards.reduce((sum, row) => sum + row.payableCents, 0),
    paidCents: cards.reduce((sum, row) => sum + row.paidCents, 0),
    unpaidCents: cards.reduce((sum, row) => sum + row.unpaidCents, 0),
    prepaidCents,
  }
}
function pageCards(cards: ApCard[], query: Query, dates: Map<string, string> = new Map()) {
  const dateOf = (row: ApCard) => dates.get(row.id) ?? row.orderDate
  const sorted = [...cards].sort(
    (a, b) => dateOf(b).localeCompare(dateOf(a)) || Number(b.id) - Number(a.id),
  )
  const cursor = query.cursor ? decodeCursor(query.cursor) : null
  const rest = sorted.filter(
    (row) =>
      !cursor ||
      dateOf(row) < String(cursor[0]) ||
      (dateOf(row) === String(cursor[0]) && Number(row.id) < cursor[1]),
  )
  return pageOf(rest, query.limit, (row) => [dateOf(row), Number(row.id)])
}
@Injectable()
export class ApReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly purchase: PurchaseService,
  ) {}
  private async cards(tx: Db | Tx, viewer: Viewer, id: number): Promise<ApCard[]> {
    const ledger = await loadPaymentLedger(tx, id)
    const cards = await this.purchase.cards(tx, viewer, eq(purchaseOrders.supplierId, id))
    return cards
      .filter((card) => card.status === 'received')
      .map((card) => {
        const amounts = found(ledger.cards.find((row) => row.id === card.id))
        return {
          ...card,
          ...amounts,
          docType: 'po',
          docId: card.id,
          apStatus:
            amounts.payableCents === 0
              ? 'no_pay'
              : amounts.unpaidCents === 0
                ? 'paid'
                : amounts.paidCents > 0
                  ? 'partial'
                  : 'unpaid',
        }
      })
  }
  async payables(
    viewer: Viewer,
    query: ParsedInput<typeof contract.listPayables>['query'],
  ): Promise<OutputOf<typeof contract.listPayables>> {
    return this.db.transaction(
      async (tx) => {
        const ids = await tx.select({ id: suppliers.id }).from(suppliers)
        const cards = (await Promise.all(ids.map((row) => this.cards(tx, viewer, row.id))))
          .flat()
          .filter((row) => row.unpaidCents > 0)
        const page = pageCards(cards, query)
        return { items: page.items, nextCursor: page.nextCursor, actions: [] }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
  async supplierList(
    query: ParsedInput<typeof contract.listFinanceSuppliers>['query'],
  ): Promise<OutputOf<typeof contract.listFinanceSuppliers>> {
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select()
          .from(suppliers)
          .orderBy(asc(suppliers.name), asc(suppliers.id))
        const cursor = query.cursor ? decodeCursor(query.cursor) : null
        const page = pageOf(
          rows.filter(
            (row) =>
              (!query.q || row.name.includes(query.q)) &&
              (!cursor ||
                row.name > String(cursor[0]) ||
                (row.name === String(cursor[0]) && row.id > cursor[1])),
          ),
          query.limit,
          (row) => [row.name, row.id],
        )
        return {
          items: await Promise.all(
            page.items.map(async (row) => {
              const ledger = await loadPaymentLedger(tx, row.id)
              return {
                supplierId: String(row.id),
                supplierName: row.name,
                enabled: row.enabled,
                payableCents: ledger.cards.reduce((sum, card) => sum + card.payableCents, 0),
                paidCents: ledger.cards.reduce((sum, card) => sum + card.paidCents, 0),
                unpaidCents: ledger.cards.reduce((sum, card) => sum + card.unpaidCents, 0),
                prepaidCents: ledger.prepaidCents,
              }
            }),
          ),
          nextCursor: page.nextCursor,
          actions: [],
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
  async supplier(
    viewer: Viewer,
    id: number,
    query: Query,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.getFinanceSupplier>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.supplier(viewer, id, query, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const tx = executor
    const supplier = found((await tx.select().from(suppliers).where(eq(suppliers.id, id)))[0])
    const ledger = await loadPaymentLedger(tx, id)
    const all = await this.cards(tx, viewer, id)
    const dates = documentDates(ledger.docs)
    const ranged = all.filter((row) => {
      const date = dates.get(row.id) ?? row.orderDate
      return (!query.from || date >= query.from) && (!query.to || date <= query.to)
    })
    const page = pageCards(
      ranged.filter((row) => !query.status || row.apStatus === query.status),
      query,
      dates,
    )
    return {
      items: page.items,
      nextCursor: page.nextCursor,
      actions: viewer.modules.includes('finance')
        ? [
            enabledAction('registerPayment', false),
            ...(ledger.prepaidCents > 0 && all.some((row) => row.unpaidCents > 0)
              ? [enabledAction('allocatePrepaid', false)]
              : []),
          ]
        : [],
      counts: {
        unpaid: ranged.filter((row) => row.apStatus === 'unpaid').length,
        partial: ranged.filter((row) => row.apStatus === 'partial').length,
      },
      supplierId: String(id),
      supplierName: supplier.name,
      ...totals(ranged, ledger.prepaidCents),
      refunds: await Promise.all(ledger.refunds.map((row) => refundView(tx, row, viewer))),
    }
  }
  async statement(
    viewer: Viewer,
    query: Query,
  ): Promise<OutputOf<typeof contract.supplierStatement>> {
    return this.db.transaction(
      async (tx) => {
        const statement = await this.supplier(viewer, viewer.supplierId ?? 0, query, tx)
        const ledger = await loadPaymentLedger(tx, viewer.supplierId ?? 0)
        return {
          ...statement,
          items: statement.items.map((item) => ({
            ...item,
            allocations: ledger.allocations
              .filter(
                (row) =>
                  row.poId === Number(item.id) &&
                  row.revokedAt === null &&
                  (ledger.replay.effective.get(row.id) ?? 0) > 0,
              )
              .map((row) => ({
                date: shanghaiDateOf(row.createdAt.getTime()),
                amountCents: ledger.replay.effective.get(row.id) ?? 0,
              })),
          })),
          refunds: statement.refunds.map((row) => ({
            no: row.no,
            date: row.refundDate,
            amountCents: row.amountCents,
            status: row.status,
          })),
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
  async unpaid(viewer: Viewer, id: number): Promise<OutputOf<typeof contract.listUnpaidDocuments>> {
    return this.db.transaction(
      async (tx) => {
        const ledger = await loadPaymentLedger(tx, id)
        found((await tx.select().from(suppliers).where(eq(suppliers.id, id)))[0])
        return {
          ledgerToken: ledger.token,
          prepaidCents: ledger.prepaidCents,
          items: (await this.cards(tx, viewer, id))
            .filter((row) => row.unpaidCents > 0)
            .sort((a, b) => a.orderDate.localeCompare(b.orderDate) || Number(a.id) - Number(b.id))
            .map((row) => ({ ...row, notice: row.repriced ? copy.rework.apRepriceNotice : null })),
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
  async payable(viewer: Viewer, id: number): Promise<OutputOf<typeof contract.getApDocument>> {
    return this.db.transaction((tx) => this.purchase.detail(tx, viewer, id), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }
  async todos(viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const page = await this.payables(viewer, { limit: TODO_PREVIEW_COUNT })
    const all = await this.payables(viewer, { limit: 100000 })
    return {
      count: all.items.length,
      items: page.items.map((payable) => ({ kind: 'payable', payable })),
    }
  }
}
