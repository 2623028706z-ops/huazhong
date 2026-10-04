import { appError, copy, type contract, type OrderDetail } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { orders } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { diffOrder } from './domain/order-diff.ts'
import {
  insertChange,
  orderStateOf,
  orderVersionPlusOne,
  replaceLines,
  type NewLine,
} from './order-lines.ts'

export type ConfirmInput = ParsedInput<typeof contract.confirmOrder>['body']

export function confirmationOf(before: OrderDetail, input: ConfirmInput, lines: NewLine[]) {
  const beforeState = orderStateOf(before)
  const afterState = {
    status: 'to_ship' as const,
    shipDate: input.shipDate,
    note: input.note ?? before.note ?? '',
    lines,
  }
  const productChanged =
    lines.length !== before.lines.length ||
    lines.some((line) => {
      const old = before.lines.find((row) => Number(row.productId) === line.productId)
      return !old || old.qty !== line.qty || old.priceCents !== line.priceCents
    })
  if (productChanged && !input.reason?.trim())
    throw appError.validation({ reason: copy.order.editReasonRequired })
  return { beforeState, afterState, productChanged, items: diffOrder(beforeState, afterState) }
}

export async function saveConfirmation(
  ctx: WriteContext,
  viewer: Viewer,
  target: { id: number; input: ConfirmInput; change: ReturnType<typeof confirmationOf>; now: Date },
) {
  const { id, input, change, now } = target
  await ctx.tx
    .update(orders)
    .set({
      status: 'to_ship',
      shipDate: input.shipDate,
      note: change.afterState.note,
      confirmedBy: viewer.accountId,
      confirmedAt: now,
      version: orderVersionPlusOne,
    })
    .where(eq(orders.id, id))
  if (change.productChanged)
    await replaceLines(ctx.tx, { id, createdBy: viewer.accountId }, change.afterState.lines)
  if (change.items.length) await insertChange(ctx, id, change.items, input.reason ?? '')
}
