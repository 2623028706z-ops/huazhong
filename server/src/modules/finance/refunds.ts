import { refundView } from '../../common/finance-history.ts'
import { appError, contract, copy, type OutputOf } from '@huazhong/shared'
import { Injectable, Controller } from '@nestjs/common'
import { and, eq, isNull, sql } from 'drizzle-orm'
import {
  allocations,
  paymentAllocations,
  paymentMethods,
  refunds,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { owns } from '../../common/ledger.ts'
import { RefundSources } from './refund-sources.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

@Injectable()
export class RefundService {
  constructor(
    private readonly writes: WriteService,
    private readonly clock: Clock,
    private readonly sources: RefundSources,
  ) {}
  private async validateRefund(ctx: WriteContext, input: In<'createRefund'>['body']) {
    if (input.refundDate > this.clock.today())
      throw appError.validation({ refundDate: copy.rework.refundDateFuture })
    const [method] = await ctx.tx
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.name, input.methodName), eq(paymentMethods.enabled, true)))
    if (!method) throw appError.businessRule(copy.finance.methodDisabled)
  }
  create(
    viewer: Viewer,
    input: In<'createRefund'>['body'],
    key: string,
  ): Promise<OutputOf<typeof contract.createRefund>> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const id = Number(input.kind === 'receipt' ? input.receiptId : input.paymentId)
        const source = await this.sources.load(ctx, input.kind, id)
        if (source.row.status !== 'valid' || input.amountCents > source.balance)
          throw appError.businessRule(copy.rework.refundOver)
        await this.validateRefund(ctx, input)
        const row = found(
          (
            await ctx.tx
              .insert(refunds)
              .values({
                no: await ctx.nextDocNo('TK'),
                kind: input.kind,
                receiptId: input.kind === 'receipt' ? id : null,
                paymentId: input.kind === 'payment' ? id : null,
                refundDate: input.refundDate,
                amountCents: input.amountCents,
                methodName: input.methodName,
                note: input.note,
                createdBy: viewer.accountId,
              })
              .returning()
          )[0],
        )
        await ctx.log({
          module: 'finance',
          kind: copy.log.kind.refund,
          action: copy.log.action.registerRefund,
          targetType: 'refunds',
          targetId: row.id,
          targetLabel: row.no,
          after: input,
        })
        await this.sources.notify(ctx, input.kind, source.owner)
        return refundView(ctx.tx, row, viewer)
      },
      { endpoint: contract.createRefund, key },
    )
  }
  void(
    viewer: Viewer,
    id: number,
    input: In<'voidRefund'>['body'],
  ): Promise<OutputOf<typeof contract.voidRefund>> {
    return this.writes.run(viewer, async (ctx) => {
      const pointer = found((await ctx.tx.select().from(refunds).where(eq(refunds.id, id)))[0])
      const source = await this.sources.load(
        ctx,
        pointer.kind,
        pointer.receiptId ?? pointer.paymentId ?? 0,
      )
      const current = found((await ctx.tx.select().from(refunds).where(eq(refunds.id, id)))[0])
      if (!owns(viewer, current.createdBy)) throw appError.forbidden()
      gateAction(await refundView(ctx.tx, current, viewer), {
        code: 'voidRefund',
        version: input.version,
        missing: copy.rework.refundVoidLocked,
        stale: copy.rework.refundStale,
      })
      const row = found(
        (
          await ctx.tx
            .update(refunds)
            .set({
              status: 'voided',
              voidReason: input.reason,
              voidedAt: this.clock.now(),
              voidedBy: viewer.accountId,
              version: sql`${refunds.version}+1`,
            })
            .where(eq(refunds.id, id))
            .returning()
        )[0],
      )
      await ctx.log({
        module: 'finance',
        kind: copy.log.kind.refund,
        action: copy.log.action.voidRefund,
        targetType: 'refunds',
        targetId: id,
        targetLabel: row.no,
        reason: input.reason,
      })
      await this.sources.notify(ctx, row.kind, source.owner)
      return refundView(ctx.tx, row, viewer)
    })
  }
  revoke(
    viewer: Viewer,
    id: number,
    reason: string,
    payment: true,
  ): Promise<OutputOf<typeof contract.revokePaymentAllocation>>
  revoke(
    viewer: Viewer,
    id: number,
    reason: string,
    payment: false,
  ): Promise<OutputOf<typeof contract.revokeAllocation>>
  revoke(viewer: Viewer, id: number, reason: string, payment: boolean) {
    if (payment)
      return this.writes.run(viewer, (ctx) => this.revokePayment(ctx, viewer, id, reason))
    return this.writes.run(viewer, (ctx) => this.revokeReceipt(ctx, viewer, id, reason))
  }
  private async revokePayment(ctx: WriteContext, viewer: Viewer, id: number, reason: string) {
    const pointer = found(
      (await ctx.tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, id)))[0],
    )
    const source = await this.sources.load(ctx, 'payment', pointer.paymentId)
    const row = found(
      (await ctx.tx.select().from(paymentAllocations).where(eq(paymentAllocations.id, id)))[0],
    )
    if (!owns(viewer, row.createdBy)) throw appError.forbidden()
    if (row.revokedAt !== null || source.row.status !== 'valid')
      throw appError.businessRule(copy.rework.allocationLocked)
    await ctx.tx
      .update(paymentAllocations)
      .set({ revokedAt: this.clock.now(), revokedBy: viewer.accountId, revokeReason: reason })
      .where(and(eq(paymentAllocations.id, id), isNull(paymentAllocations.revokedAt)))
    await ctx.log({
      module: 'finance',
      kind: copy.log.kind.allocation,
      action: copy.log.action.revokePaymentAllocation,
      targetType: 'payment_allocations',
      targetId: id,
      targetLabel: source.row.no,
      reason,
    })
    await this.sources.notify(ctx, 'payment', source.owner)
    return this.sources.paymentReads.detail(ctx.tx, row.paymentId, viewer)
  }
  private async revokeReceipt(ctx: WriteContext, viewer: Viewer, id: number, reason: string) {
    const pointer = found(
      (await ctx.tx.select().from(allocations).where(eq(allocations.id, id)))[0],
    )
    const source = await this.sources.load(ctx, 'receipt', pointer.receiptId)
    const row = found((await ctx.tx.select().from(allocations).where(eq(allocations.id, id)))[0])
    if (!owns(viewer, row.createdBy)) throw appError.forbidden()
    if (row.revokedAt !== null || source.row.status !== 'valid')
      throw appError.businessRule(copy.rework.allocationLocked)
    await ctx.tx
      .update(allocations)
      .set({ revokedAt: this.clock.now(), revokedBy: viewer.accountId, revokeReason: reason })
      .where(and(eq(allocations.id, id), isNull(allocations.revokedAt)))
    await ctx.log({
      module: 'finance',
      kind: copy.log.kind.allocation,
      action: copy.log.action.revokeAllocation,
      targetType: 'allocations',
      targetId: id,
      targetLabel: source.row.no,
      reason,
    })
    await this.sources.notify(ctx, 'receipt', source.owner)
    return this.sources.receipts.detail(ctx.tx, row.receiptId, viewer)
  }
}
@Controller()
export class RefundController {
  constructor(private readonly service: RefundService) {}
  @Route(contract.createRefund)
  create(@CurrentViewer() viewer: Viewer, @Input() input: In<'createRefund'>) {
    return this.service.create(viewer, input.body, input.idempotencyKey)
  }
  @Route(contract.voidRefund)
  void(@CurrentViewer() viewer: Viewer, @Input() input: In<'voidRefund'>) {
    return this.service.void(viewer, Number(input.params.id), input.body)
  }
  @Route(contract.revokeAllocation)
  revoke(@CurrentViewer() viewer: Viewer, @Input() input: In<'revokeAllocation'>) {
    return this.service.revoke(viewer, Number(input.params.id), input.body.reason, false)
  }
  @Route(contract.revokePaymentAllocation)
  revokePayment(@CurrentViewer() viewer: Viewer, @Input() input: In<'revokePaymentAllocation'>) {
    return this.service.revoke(viewer, Number(input.params.id), input.body.reason, true)
  }
}
