import { appError, copy, type PoDetail } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { priceChanges, purchaseOrderLines } from '../../../db/schema/index.ts'
import { actorLabelOf } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'

type Prices = readonly { poLineId: string; priceCents: number; receivedQty?: number }[]
export function assertPoLines(
  detail: PoDetail,
  lines: readonly { poLineId: string }[],
  all: boolean,
) {
  if (
    (all && detail.lines.length !== lines.length) ||
    lines.some((line) => !detail.lines.some((old) => old.id === line.poLineId))
  ) {
    throw appError.businessRule(copy.finance.poLinesChanged)
  }
}
export async function applyPoPrices(
  ctx: WriteContext,
  detail: PoDetail,
  input: { lines: Prices; reason: string },
) {
  const changes = detail.lines.flatMap((old) => {
    const line = input.lines.find((row) => row.poLineId === old.id)
    return line && old.priceCents !== line.priceCents
      ? [
          {
            name: old.name,
            fromCents: old.priceCents,
            toCents: line.priceCents,
            qty: line.receivedQty ?? Math.max((old.receivedQty ?? 0) - old.returnedQty, 0),
          },
        ]
      : []
  })
  if (changes.length === 0) return []
  for (const line of input.lines) {
    await ctx.tx
      .update(purchaseOrderLines)
      .set({ priceCents: line.priceCents })
      .where(eq(purchaseOrderLines.id, Number(line.poLineId)))
  }
  await ctx.tx.insert(priceChanges).values({
    poId: Number(detail.id),
    actorLabel: actorLabelOf(ctx.viewer),
    reason: input.reason,
    items: changes,
    createdBy: ctx.viewer?.accountId ?? 0,
  })
  return changes
}
