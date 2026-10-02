import { contract, waitCodesOf, type OutputOf, type PaymentDetail } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { payments, purchaseOrders, suppliers } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { waitCounts } from '../../common/domain/counts.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'

function rowsOf(executor: Db | Tx, where?: SQL) {
  return executor
    .select({ payment: payments, supplierName: suppliers.name, docNo: purchaseOrders.no })
    .from(payments)
    .innerJoin(suppliers, eq(suppliers.id, payments.supplierId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, payments.poId))
    .where(where)
}
function paymentOf(row: Awaited<ReturnType<typeof rowsOf>>[number]): PaymentDetail {
  const p = row.payment
  return {
    id: String(p.id),
    no: p.no,
    version: p.version,
    docType: 'po',
    docId: String(p.poId),
    docNo: row.docNo,
    supplierId: String(p.supplierId),
    supplierName: row.supplierName,
    payDate: p.payDate,
    amountCents: p.amountCents,
    methodName: p.methodName,
    note: orNull(p.note),
    status: p.status,
    voidReason: p.voidReason,
    voidedAt: p.voidedAt?.toISOString() ?? null,
    actions: p.status === 'valid' ? [enabledAction('voidPayment', true)] : [],
    lockedReason: null,
  }
}
@Injectable()
export class PaymentReads {
  constructor(@Inject(DB) private readonly db: Db) {}
  get(id: number) {
    return this.detail(this.db, id)
  }
  async detail(executor: Db | Tx, id: number) {
    return paymentOf(found((await rowsOf(executor, eq(payments.id, id)))[0]))
  }
  async forPo(executor: Db | Tx, id: number) {
    const [row] = await rowsOf(executor, eq(payments.poId, id)).orderBy(desc(payments.id)).limit(1)
    return row === undefined ? null : paymentOf(row)
  }
  async records(
    query: ParsedInput<typeof contract.listFinanceRecords>['query'],
  ): Promise<OutputOf<typeof contract.listFinanceRecords>> {
    const rows = await rowsOf(
      this.db,
      and(
        query.status ? eq(payments.status, query.status) : undefined,
        dateBetween(payments.payDate, query),
        beforeCursor(payments.payDate, payments.id, query.cursor),
      ),
    )
      .orderBy(desc(payments.payDate), desc(payments.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.payment.payDate, row.payment.id])
    // 收付款状态都不是等待类，按 05 章第 1.3 节返回 {}（和收款一致）
    return {
      items: page.items.map(paymentOf),
      nextCursor: page.nextCursor,
      actions: [],
      counts: waitCounts(waitCodesOf('recordStatus'), []),
    }
  }
}
