import { refundView, paymentHistory } from '../../common/finance-history.ts'
import { contract, copy, type OutputOf, type PaymentDetail } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { payments, suppliers } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { actor } from '../../common/ledger.ts'
import { fundActions } from '../../common/finance-actions.ts'
import { loadPaymentLedger } from '../../common/payment-ledger.ts'

@Injectable()
export class PaymentReads {
  constructor(@Inject(DB) private readonly db: Db) {}
  get(id: number, viewer?: Viewer) {
    return this.db.transaction((tx) => this.detail(tx, id, viewer), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }
  async detail(executor: Db | Tx, id: number, viewer?: Viewer): Promise<PaymentDetail> {
    const row = found((await executor.select().from(payments).where(eq(payments.id, id)))[0])
    const supplier = found(
      (await executor.select().from(suppliers).where(eq(suppliers.id, row.supplierId)))[0],
    )
    const ledger = await loadPaymentLedger(executor, row.supplierId)
    return {
      no: row.no,
      version: row.version,
      status: row.status,
      payDate: row.payDate,
      methodName: row.methodName,
      amountCents: row.amountCents,
      voidReason: row.voidReason,
      id: String(id),
      supplierId: String(row.supplierId),
      supplierName: supplier.name,
      prepaidCents: ledger.replay.left.get(id) ?? 0,
      allocations: (await paymentHistory(executor, ledger, viewer)).filter(
        (allocation) => allocation.paymentId === String(id),
      ),
      refunds: await Promise.all(
        ledger.refunds
          .filter((refund) => refund.paymentId === id)
          .map((refund) => refundView(executor, refund, viewer)),
      ),
      notice: row.status === 'voided' ? copy.finance.receiptVoidedNotice : null,
      note: row.note || null,
      voidedAt: row.voidedAt?.toISOString() ?? null,
      voidedBy: await actor(executor, row.voidedBy),
      actions: fundActions(
        { ...row, kind: 'payment' },
        ledger.replay.left.get(id) ?? 0,
        ledger.refunds.some((refund) => refund.paymentId === id && refund.status === 'valid'),
        viewer,
      ),
      lockedReason: null,
    }
  }
  async records(
    query: ParsedInput<typeof contract.listFinanceRecords>['query'],
    viewer?: Viewer,
  ): Promise<OutputOf<typeof contract.listFinanceRecords>> {
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select()
          .from(payments)
          .where(
            and(
              query.status ? eq(payments.status, query.status) : undefined,
              dateBetween(payments.payDate, query),
              beforeCursor(payments.payDate, payments.id, query.cursor),
            ),
          )
          .orderBy(desc(payments.payDate), desc(payments.id))
          .limit(query.limit + 1)
        const page = pageOf(rows, query.limit, (row) => [row.payDate, row.id])
        return {
          items: await Promise.all(page.items.map((row) => this.detail(tx, row.id, viewer))),
          nextCursor: page.nextCursor,
          actions: [],
          counts: {},
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
}
