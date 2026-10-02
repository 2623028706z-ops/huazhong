import { copy } from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import { orders, orderCancelRequests } from '../../../db/schema/index.ts'
import { found } from '../../common/scope.ts'
import type { WriteContext } from '../../common/write.service.ts'

export type LifecycleAction =
  'requestCancel' | 'withdrawCancel' | 'approveCancel' | 'rejectCancel' | 'voidOrder'
interface Transition {
  id: number
  code: LifecycleAction
  reason: string
  now: Date
  accountId: number
}

async function handleCancelRequest(ctx: WriteContext, change: Transition) {
  const { id, code, reason, now } = change
  const request = found(
    (
      await ctx.tx
        .select()
        .from(orderCancelRequests)
        .where(and(eq(orderCancelRequests.orderId, id), eq(orderCancelRequests.status, 'pending')))
    )[0],
  )
  const status =
    code === 'withdrawCancel' ? 'withdrawn' : code === 'approveCancel' ? 'approved' : 'rejected'
  await ctx.tx
    .update(orderCancelRequests)
    .set({
      status,
      handledBy: change.accountId,
      handledAt: now,
      rejectReason: code === 'rejectCancel' ? reason : null,
    })
    .where(eq(orderCancelRequests.id, request.id))
  if (code === 'approveCancel')
    await ctx.tx
      .update(orders)
      .set({
        status: 'cancelled',
        cancelReason: copy.rework.cancelRequestReason(request.reason),
        cancelledBy: ctx.viewer?.accountId ?? 0,
        cancelledAt: now,
      })
      .where(eq(orders.id, id))
}

export async function applyOrderLifecycle(ctx: WriteContext, change: Transition) {
  const { id, code, reason, now } = change
  const accountId = ctx.viewer?.accountId ?? 0
  if (code === 'requestCancel') {
    await ctx.tx.insert(orderCancelRequests).values({
      orderId: id,
      reason,
      requestedBy: accountId,
      requestedAt: now,
      createdBy: accountId,
    })
  } else if (code === 'voidOrder') {
    await ctx.tx
      .update(orders)
      .set({ status: 'voided', voidReason: reason, voidedBy: accountId, voidedAt: now })
      .where(eq(orders.id, id))
  } else await handleCancelRequest(ctx, change)
}
