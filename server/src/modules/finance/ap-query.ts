import { and, eq, gt, inArray, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { payments, purchaseOrderLines, purchaseOrders } from '../../../db/schema/index.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { dateBetween } from '../../common/page.ts'
import type { contract } from '@huazhong/shared'

export type StatementQuery = ParsedInput<typeof contract.getFinanceSupplier>['query']
export function apQuery(db: Db) {
  const amounts = db
    .select({
      poId: purchaseOrderLines.poId,
      total:
        sql<number>`sum((${purchaseOrderLines.receivedQty} - ${purchaseOrderLines.returnedQty})::bigint * ${purchaseOrderLines.priceCents})`
          .mapWith(Number)
          .as('total'),
    })
    .from(purchaseOrderLines)
    .groupBy(purchaseOrderLines.poId)
    .as('po_amounts')
  const paid = sql<number>`coalesce(${payments.amountCents}, 0)`.mapWith(Number)
  return {
    amounts,
    paid,
    base: and(eq(purchaseOrders.status, 'received'), gt(amounts.total, 0)),
    select: () =>
      db
        .select({
          id: purchaseOrders.id,
          orderDate: purchaseOrders.orderDate,
          supplierId: purchaseOrders.supplierId,
          payableCents: amounts.total,
          paidCents: paid,
        })
        .from(purchaseOrders)
        .innerJoin(amounts, eq(amounts.poId, purchaseOrders.id))
        .leftJoin(
          payments,
          and(eq(payments.poId, purchaseOrders.id), eq(payments.status, 'valid')),
        ),
  }
}
export function apStatusFilter(status: StatementQuery['status']): SQL | undefined {
  if (status === undefined) return undefined
  if (status === 'no_pay') return sql`false`
  return status === 'paid' ? sql`${payments.id} IS NOT NULL` : sql`${payments.id} IS NULL`
}
export async function apSummary(db: Db, ids: number[], range: StatementQuery | null = null) {
  if (ids.length === 0)
    return new Map<number, { payableCents: number; paidCents: number; unpaidCents: number }>()
  const query = apQuery(db)
  const rows = await db
    .select({
      supplierId: purchaseOrders.supplierId,
      payableCents: sql<number>`sum(${query.amounts.total})`.mapWith(Number),
      paidCents: sql<number>`sum(${query.paid})`.mapWith(Number),
      unpaidCents: sql<number>`sum(${query.amounts.total} - ${query.paid})`.mapWith(Number),
    })
    .from(purchaseOrders)
    .innerJoin(query.amounts, eq(query.amounts.poId, purchaseOrders.id))
    .leftJoin(payments, and(eq(payments.poId, purchaseOrders.id), eq(payments.status, 'valid')))
    .where(
      and(
        query.base,
        inArray(purchaseOrders.supplierId, ids),
        range === null ? undefined : dateBetween(purchaseOrders.orderDate, range),
      ),
    )
    .groupBy(purchaseOrders.supplierId)
  return new Map(rows.map(({ supplierId, ...totals }) => [supplierId, totals]))
}
