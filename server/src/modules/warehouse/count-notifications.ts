import { and, inArray } from 'drizzle-orm'
import { stockMoves } from '../../../db/schema/index.ts'
import type { WriteContext } from '../../common/write.service.ts'

export async function notifyCountedDocs(ctx: WriteContext, materialIds: number[]) {
  const docs =
    materialIds.length === 0
      ? []
      : await ctx.tx
          .selectDistinct({ type: stockMoves.docType, id: stockMoves.docId })
          .from(stockMoves)
          .where(
            and(
              inArray(stockMoves.materialId, materialIds),
              inArray(stockMoves.type, ['po_in', 'manual_in', 'manual_out', 'loss']),
            ),
          )
  ctx.notify([
    { topic: 'stock', version: null },
    { topic: 'demand', version: null },
    { topic: 'pos', version: null },
    { topic: 'wh_docs', version: null },
  ])
  for (const doc of docs) {
    if (doc.type === 'po') ctx.notify([{ topic: `po:${doc.id}`, version: null }])
    if (doc.type === 'wh') ctx.notify([{ topic: `wh_doc:${doc.id}`, version: null }])
  }
}
