import { appError, contract, copy, type OutputOf } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { paymentAllocations, paymentMethods, payments } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { drawPrepaid } from './domain/ar.ts'
import {
  assertSnapshot,
  lockSupplierLedger,
  notifySupplierFinance,
  owns,
} from '../../common/ledger.ts'
import { apKey, loadPaymentLedger } from '../../common/payment-ledger.ts'
import { PaymentReads } from './payment-reads.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>['body']
@Injectable()
export class PaymentWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly clock: Clock,
    private readonly reads: PaymentReads,
  ) {}
  private async check(
    ctx: WriteContext,
    input: In<'createPayment'> | In<'allocatePaymentPrepaid'>,
  ) {
    const supplierId = Number(input.supplierId)
    await lockSupplierLedger(ctx.tx, supplierId)
    const ledger = await loadPaymentLedger(ctx.tx, supplierId)
    if (input.allocs.some((allocation) => !ledger.card(allocation.docType, allocation.docId)))
      throw appError.notFound()
    assertSnapshot(
      {
        ledgerToken: ledger.token,
        items: ledger.cards
          .filter((row) => row.unpaidCents > 0)
          .map((row) => ({ ...row, id: row.key })),
      },
      input,
      input.allocs.map((row) => apKey(row.docType, row.docId)),
      input.expected.map((row) => apKey(row.docType, row.docId)),
    )
    for (const allocation of input.allocs) {
      const doc = ledger.card(allocation.docType, allocation.docId)
      if (!doc) throw appError.notFound()
      if (allocation.amountCents > doc.unpaidCents)
        throw appError.businessRule(copy.rework.paymentAllocOver)
      if (allocation.docType === 'wh' && allocation.amountCents !== doc.unpaidCents)
        throw appError.businessRule(copy.stock.stockInPayWhole)
    }
    return ledger
  }
  async notify(ctx: WriteContext, supplierId: number) {
    await notifySupplierFinance(ctx, supplierId)
  }
  private async validatePayment(ctx: WriteContext, input: In<'createPayment'>) {
    if (input.payDate > this.clock.today())
      throw appError.validation({ payDate: copy.finance.payDateFuture })
    const [method] = await ctx.tx
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.name, input.methodName), eq(paymentMethods.enabled, true)))
    if (!method) throw appError.businessRule(copy.finance.methodDisabled)
  }
  create(
    viewer: Viewer,
    input: In<'createPayment'>,
    key: string,
  ): Promise<OutputOf<typeof contract.createPayment>> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        await this.check(ctx, input)
        await this.validatePayment(ctx, input)
        const row = found(
          (
            await ctx.tx
              .insert(payments)
              .values({
                no: await ctx.nextDocNo('FK'),
                supplierId: Number(input.supplierId),
                payDate: input.payDate,
                amountCents: input.amountCents,
                methodName: input.methodName,
                note: input.note,
                createdBy: viewer.accountId,
              })
              .returning()
          )[0],
        )
        if (input.allocs.length)
          await ctx.tx.insert(paymentAllocations).values(
            input.allocs.map((allocation) => ({
              paymentId: row.id,
              poId: allocation.docType === 'po' ? Number(allocation.docId) : null,
              whDocId: allocation.docType === 'wh' ? Number(allocation.docId) : null,
              amountCents: allocation.amountCents,
              kind: 'direct' as const,
              createdBy: viewer.accountId,
            })),
          )
        await this.logPayment(ctx, row, input)
        await this.notify(ctx, row.supplierId)
        return this.reads.detail(ctx.tx, row.id, viewer)
      },
      {
        endpoint: contract.createPayment,
        key,
        replay: (tx, response) =>
          this.reads.detail(tx, Number((response as { id: string }).id), viewer),
      },
    )
  }
  private logPayment(
    ctx: WriteContext,
    row: { id: number; no: string },
    input: In<'createPayment'>,
  ) {
    return ctx.log({
      module: 'finance',
      kind: copy.log.kind.payment,
      action: copy.log.action.registerPayment,
      targetType: 'payments',
      targetId: row.id,
      targetLabel: row.no,
      after: input,
    })
  }
  allocate(
    viewer: Viewer,
    input: In<'allocatePaymentPrepaid'>,
    key: string,
  ): Promise<OutputOf<typeof contract.allocatePaymentPrepaid>> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const ledger = await this.check(ctx, input)
        const total = input.allocs.reduce((sum, row) => sum + row.amountCents, 0)
        if (total > ledger.prepaidCents) throw appError.businessRule(copy.rework.paymentPrepaidOver)
        const draws = drawPrepaid(
          ledger.money.map((row) => ({ ...row, receiptDate: row.payDate })),
          ledger.replay.left,
          input.allocs.map((row) => ({
            orderId: apKey(row.docType, row.docId),
            amountCents: row.amountCents,
          })),
        )
        await ctx.tx.insert(paymentAllocations).values(
          draws.map((row) => ({
            paymentId: row.receiptId,
            poId: row.orderId.startsWith('po:') ? Number(row.orderId.split(':')[1]) : null,
            whDocId: row.orderId.startsWith('wh:') ? Number(row.orderId.split(':')[1]) : null,
            amountCents: row.amountCents,
            kind: 'prepaid' as const,
            createdBy: viewer.accountId,
          })),
        )
        await ctx.log({
          module: 'finance',
          kind: copy.log.kind.payment,
          action: copy.log.action.allocatePaymentPrepaid,
          targetType: 'suppliers',
          targetId: ledger.supplierId,
          targetLabel: input.supplierId,
          after: input,
        })
        await this.notify(ctx, ledger.supplierId)
        return {
          supplierId: input.supplierId,
          prepaidCents: (await loadPaymentLedger(ctx.tx, ledger.supplierId)).prepaidCents,
        }
      },
      { endpoint: contract.allocatePaymentPrepaid, key },
    )
  }
  void(viewer: Viewer, id: number, input: In<'voidPayment'>) {
    return this.writes.run(viewer, async (ctx) => {
      const row = found((await ctx.tx.select().from(payments).where(eq(payments.id, id)))[0])
      await lockSupplierLedger(ctx.tx, row.supplierId)
      const detail = await this.reads.detail(ctx.tx, id, viewer)
      if (!owns(viewer, row.createdBy)) throw appError.forbidden()
      if (detail.refunds.some((refund) => refund.status === 'valid'))
        throw appError.businessRule(copy.rework.paymentVoidLocked)
      gateAction(detail, {
        code: 'voidPayment',
        version: input.version,
        missing: copy.rework.paymentStale,
        stale: copy.rework.paymentStale,
      })
      const now = this.clock.now()
      await ctx.tx
        .update(payments)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: now,
          version: sql`${payments.version} + 1`,
        })
        .where(eq(payments.id, id))
      await ctx.tx
        .update(paymentAllocations)
        .set({ revokedAt: now, revokedBy: viewer.accountId, revokeReason: input.reason })
        .where(and(eq(paymentAllocations.paymentId, id), isNull(paymentAllocations.revokedAt)))
      await ctx.log({
        module: 'finance',
        kind: copy.log.kind.payment,
        action: copy.log.action.voidPayment,
        targetType: 'payments',
        targetId: id,
        targetLabel: row.no,
        reason: input.reason,
      })
      await this.notify(ctx, row.supplierId)
      return this.reads.detail(ctx.tx, id, viewer)
    })
  }
}
