import { contract, TODO_PREVIEW_COUNT, type ApCard, type OutputOf } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, ilike, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { payments, purchaseOrders, suppliers } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { afterCursor, beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { PurchaseService } from '../purchase/purchase.service.ts'
import { apQuery, apStatusFilter, apSummary, type StatementQuery } from './ap-query.ts'
import { PaymentReads } from './payment-reads.ts'

const ZERO = { payableCents: 0, paidCents: 0, unpaidCents: 0 }
type ApRow = Awaited<ReturnType<ReturnType<typeof apQuery>['select']>>[number]
@Injectable()
export class ApReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly purchase: PurchaseService,
    private readonly paymentReads: PaymentReads,
  ) {}
  private async cards(viewer: Viewer, rows: ApRow[]): Promise<ApCard[]> {
    if (rows.length === 0) return []
    const cards = await this.purchase.cards(
      this.db,
      viewer,
      inArray(
        purchaseOrders.id,
        rows.map((row) => row.id),
      ),
    )
    const byId = new Map(cards.map((card) => [Number(card.id), card]))
    return rows.map((row) => ({
      ...found(byId.get(row.id)),
      docType: 'po',
      docId: String(row.id),
      paidCents: row.paidCents,
      unpaidCents: row.payableCents - row.paidCents,
    }))
  }
  async payables(
    viewer: Viewer,
    input: ParsedInput<typeof contract.listPayables>['query'],
  ): Promise<OutputOf<typeof contract.listPayables>> {
    const query = apQuery(this.db)
    const rows = await query
      .select()
      .where(
        and(
          query.base,
          isNull(payments.id),
          beforeCursor(purchaseOrders.orderDate, purchaseOrders.id, input.cursor),
        ),
      )
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id))
      .limit(input.limit + 1)
    const page = pageOf(rows, input.limit, (row) => [row.orderDate, row.id])
    return { items: await this.cards(viewer, page.items), nextCursor: page.nextCursor, actions: [] }
  }
  async supplierList(
    input: ParsedInput<typeof contract.listFinanceSuppliers>['query'],
  ): Promise<OutputOf<typeof contract.listFinanceSuppliers>> {
    const pattern = input.q?.replace(/[\\%_]/g, (char) => `\\${char}`)
    const rows = await this.db
      .select()
      .from(suppliers)
      .where(
        and(
          pattern ? ilike(suppliers.name, `%${pattern}%`) : undefined,
          afterCursor(suppliers.name, suppliers.id, input.cursor),
        ),
      )
      .orderBy(asc(suppliers.name), asc(suppliers.id))
      .limit(input.limit + 1)
    const page = pageOf(rows, input.limit, (row) => [row.name, row.id])
    const sums = await apSummary(
      this.db,
      page.items.map((row) => row.id),
    )
    return {
      items: page.items.map((row) => ({
        supplierId: String(row.id),
        supplierName: row.name,
        enabled: row.enabled,
        ...(sums.get(row.id) ?? ZERO),
      })),
      nextCursor: page.nextCursor,
      actions: [],
    }
  }
  async supplier(
    viewer: Viewer,
    id: number,
    input: StatementQuery,
  ): Promise<OutputOf<typeof contract.getFinanceSupplier>> {
    const supplier = found((await this.db.select().from(suppliers).where(eq(suppliers.id, id)))[0])
    const query = apQuery(this.db)
    const base = and(
      query.base,
      eq(purchaseOrders.supplierId, id),
      dateBetween(purchaseOrders.orderDate, input),
    )
    const rows = await query
      .select()
      .where(
        and(
          base,
          apStatusFilter(input.status),
          beforeCursor(purchaseOrders.orderDate, purchaseOrders.id, input.cursor),
        ),
      )
      .orderBy(desc(purchaseOrders.orderDate), desc(purchaseOrders.id))
      .limit(input.limit + 1)
    const page = pageOf(rows, input.limit, (row) => [row.orderDate, row.id])
    const [waiting] = await this.db
      .select({ total: count() })
      .from(purchaseOrders)
      .innerJoin(query.amounts, eq(query.amounts.poId, purchaseOrders.id))
      .leftJoin(payments, and(eq(payments.poId, purchaseOrders.id), eq(payments.status, 'valid')))
      .where(and(base, isNull(payments.id)))
    const sums = await apSummary(this.db, [id], input)
    return {
      items: await this.cards(viewer, page.items),
      nextCursor: page.nextCursor,
      actions: [],
      counts: { to_pay: waiting?.total ?? 0 },
      supplierId: String(id),
      supplierName: supplier.name,
      ...(sums.get(id) ?? ZERO),
    }
  }
  statement(viewer: Viewer, input: StatementQuery) {
    return this.supplier(viewer, viewer.supplierId ?? 0, input)
  }
  async payable(viewer: Viewer, id: number): Promise<OutputOf<typeof contract.getPayable>> {
    return {
      ...(await this.purchase.detail(this.db, viewer, id)),
      payment: await this.paymentReads.forPo(this.db, id),
    }
  }
  async todos(viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const query = apQuery(this.db)
    const [total] = await this.db
      .select({ value: count() })
      .from(purchaseOrders)
      .innerJoin(query.amounts, eq(query.amounts.poId, purchaseOrders.id))
      .leftJoin(payments, and(eq(payments.poId, purchaseOrders.id), eq(payments.status, 'valid')))
      .where(and(query.base, isNull(payments.id)))
    const page = await this.payables(viewer, { limit: TODO_PREVIEW_COUNT })
    return {
      count: total?.value ?? 0,
      items: page.items.map((payable) => ({ kind: 'payable', payable })),
    }
  }
}
