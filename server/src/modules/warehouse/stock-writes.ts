import { appError, copy } from '@huazhong/shared'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { materials, stockBatches, stockMoves } from '../../../db/schema/index.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { found } from '../../common/scope.ts'

interface StockDoc {
  id: number
  no: string
  date: string
}
interface StockLine {
  materialId: number
  name: string
  unit: string
  qty: number
}

// 花材锁保护批次集合；批次锁按固定顺序取得，实际扣减再按本单优先、FIFO 排序。
async function lockStockMaterials(ctx: WriteContext, ids: number[]) {
  await ctx.tx
    .select({ id: materials.id })
    .from(materials)
    .where(inArray(materials.id, ids))
    .orderBy(asc(materials.id))
    .for('update')
}
export async function receiveStock(ctx: WriteContext, doc: StockDoc, lines: StockLine[]) {
  await lockStockMaterials(
    ctx,
    lines.map((line) => line.materialId),
  )
  for (const line of lines) {
    if (line.qty === 0) continue
    const [batch] = await ctx.tx
      .insert(stockBatches)
      .values({
        materialId: line.materialId,
        inDate: doc.date,
        sourceType: 'po',
        sourceId: doc.id,
        qty: line.qty,
        leftQty: line.qty,
        createdBy: ctx.viewer?.accountId ?? 0,
      })
      .returning()
    await ctx.tx.insert(stockMoves).values({
      type: 'po_in',
      materialId: line.materialId,
      batchId: found(batch).id,
      qty: line.qty,
      docType: 'po',
      docId: doc.id,
      docNo: doc.no,
      createdBy: ctx.viewer?.accountId ?? 0,
    })
  }
}
export async function returnStock(ctx: WriteContext, doc: StockDoc, lines: StockLine[]) {
  await lockStockMaterials(
    ctx,
    lines.map((line) => line.materialId),
  )
  const batches = await ctx.tx
    .select()
    .from(stockBatches)
    .where(
      inArray(
        stockBatches.materialId,
        lines.map((line) => line.materialId),
      ),
    )
    .orderBy(asc(stockBatches.materialId), asc(stockBatches.id))
    .for('update')
  for (const line of lines) {
    const available = batches.filter(
      (batch) => batch.materialId === line.materialId && batch.leftQty > 0,
    )
    const total = available.reduce((sum, batch) => sum + batch.leftQty, 0)
    if (total < line.qty)
      throw appError.businessRule(copy.finance.returnStock(line.name, total, line.unit))
    available.sort((a, b) => {
      const ownA = a.sourceType === 'po' && a.sourceId === doc.id
      const ownB = b.sourceType === 'po' && b.sourceId === doc.id
      return Number(ownB) - Number(ownA) || a.inDate.localeCompare(b.inDate) || a.id - b.id
    })
    await deduct(ctx, doc, { line, batches: available })
  }
}
async function deduct(
  ctx: WriteContext,
  doc: StockDoc,
  input: {
    line: StockLine
    batches: (typeof stockBatches.$inferSelect)[]
  },
) {
  let left = input.line.qty
  for (const batch of input.batches) {
    if (left === 0) break
    const qty = Math.min(left, batch.leftQty)
    await ctx.tx
      .update(stockBatches)
      .set({ leftQty: sql`${stockBatches.leftQty} - ${qty}` })
      .where(eq(stockBatches.id, batch.id))
    await ctx.tx.insert(stockMoves).values({
      type: 'po_return',
      materialId: input.line.materialId,
      batchId: batch.id,
      qty: -qty,
      docType: 'po',
      docId: doc.id,
      docNo: doc.no,
      createdBy: ctx.viewer?.accountId ?? 0,
    })
    left -= qty
  }
}
