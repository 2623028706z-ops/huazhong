import { appError, contract, copy, formatMoney, labels, type OutputOf } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { paymentMethods, payments, purchaseOrders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { PurchaseService } from '../purchase/purchase.service.ts'
import { PaymentReads } from './payment-reads.ts'

type Create = ParsedInput<typeof contract.createPayment>['body']
type Void = ParsedInput<typeof contract.voidPayment>['body']
function paymentLog(row: { id: number; no: string }, action: string) {
  return {
    module: 'finance' as const,
    kind: copy.log.kind.payment,
    action,
    targetType: 'payments',
    targetId: row.id,
    targetLabel: row.no,
  }
}
@Injectable()
export class PaymentWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly purchase: PurchaseService,
    private readonly reads: PaymentReads,
    private readonly clock: Clock,
  ) {}
  create(
    viewer: Viewer,
    input: Create,
    key: string,
  ): Promise<OutputOf<typeof contract.createPayment>> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const po = await this.purchase.lock(ctx.tx, Number(input.docId))
        const detail = await this.purchase.detail(ctx.tx, viewer, po.id)
        this.validate(detail, input)
        const saved = await this.insert(ctx, po, input)
        await ctx.log({
          ...paymentLog(saved, copy.log.action.registerPayment),
          after: {
            [copy.field.amount]: formatMoney(saved.amountCents),
            [copy.screen.label.methodShort]: saved.methodName,
          },
        })
        await this.bump(ctx, po)
        return this.reads.detail(ctx.tx, saved.id)
      },
      { endpoint: contract.createPayment, key },
    )
  }
  private validate(detail: Awaited<ReturnType<PurchaseService['detail']>>, input: Create) {
    gateAction(detail, {
      code: 'pay',
      missing: detail.apStatus === 'paid' ? copy.finance.paymentAlready : copy.finance.noPayment,
      stale: copy.finance.paymentStale,
    })
    if (input.payDate > this.clock.today())
      throw appError.validation({ payDate: copy.finance.payDateFuture })
    if (input.amountCents !== detail.payableCents)
      throw appError.stale(copy.finance.paymentAmountStale(formatMoney(detail.payableCents)), {
        ...detail,
        payment: null,
      })
  }
  private async insert(ctx: WriteContext, po: { id: number; supplierId: number }, input: Create) {
    const [method] = await ctx.tx
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.kind, 'pay'),
          eq(paymentMethods.name, input.methodName),
          eq(paymentMethods.enabled, true),
        ),
      )
      .for('share')
    if (!method) throw appError.businessRule(copy.finance.paymentMethodDisabled)
    return found(
      (
        await ctx.tx
          .insert(payments)
          .values({
            no: await ctx.nextDocNo('FK'),
            poId: po.id,
            supplierId: po.supplierId,
            payDate: input.payDate,
            amountCents: input.amountCents,
            methodName: input.methodName,
            note: input.note,
            createdBy: ctx.viewer?.accountId ?? 0,
          })
          .returning()
      )[0],
    )
  }
  void(viewer: Viewer, id: number, input: Void): Promise<OutputOf<typeof contract.voidPayment>> {
    return this.writes.run(viewer, async (ctx) => {
      const pointer = found(
        (await ctx.tx.select({ poId: payments.poId }).from(payments).where(eq(payments.id, id)))[0],
      )
      // 和登记付款、退货、改价保持相同锁序：采购单在前，付款记录在后。
      const po = await this.purchase.lock(ctx.tx, pointer.poId)
      const row = found(
        (await ctx.tx.select().from(payments).where(eq(payments.id, id)).for('update'))[0],
      )
      const detail = await this.reads.detail(ctx.tx, id)
      gateAction(detail, {
        code: 'voidPayment',
        version: input.version,
        missing: copy.finance.paymentStale,
        stale: copy.finance.paymentStale,
      })
      await ctx.tx
        .update(payments)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: this.clock.now(),
          version: sql`${payments.version} + 1`,
        })
        .where(eq(payments.id, id))
      await ctx.log({
        ...paymentLog(row, copy.log.action.voidPayment),
        reason: input.reason,
        before: { [copy.field.status]: labels.recordStatus.valid },
        after: { [copy.field.status]: labels.recordStatus.voided },
      })
      await this.bump(ctx, po)
      return this.reads.detail(ctx.tx, id)
    })
  }
  private async bump(
    ctx: WriteContext,
    po: { id: number; supplierId: number; version: number; inviteId: number | null },
  ) {
    await ctx.tx
      .update(purchaseOrders)
      .set({ version: sql`${purchaseOrders.version} + 1` })
      .where(eq(purchaseOrders.id, po.id))
    this.purchase.notify(ctx, { ...po, version: po.version + 1 })
  }
}
