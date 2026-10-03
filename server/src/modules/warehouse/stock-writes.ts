import { appError, copy, type MoveType } from '@huazhong/shared'
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm'
import { materials, stockBatches, stockMoves } from '../../../db/schema/index.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { found } from '../../common/scope.ts'

// 来源单据：采购单、手工出入库单、盘点单；批次 source_type 和流水 doc_type 用同一个值
type StockDocType = 'po' | 'wh' | 'stocktake'
export interface StockDoc {
  type: StockDocType
  id: number
  no: string
  date: string
  reason?: string
}
export interface StockLine {
  materialId: number
  name: string
  unit: string
  qty: number
}

// 花材锁保护批次集合；批次锁按固定顺序取得，实际扣减再按本单优先、FIFO 排序（05 章第 10.1 节锁序）
async function lockStockMaterials(ctx: WriteContext, ids: number[]) {
  await ctx.tx
    .select({ id: materials.id })
    .from(materials)
    .where(inArray(materials.id, ids))
    .orderBy(asc(materials.id))
    .for('update')
}
function moveOf(ctx: WriteContext, doc: StockDoc, type: MoveType) {
  return {
    type,
    docType: doc.type,
    docId: doc.id,
    docNo: doc.no,
    reason: doc.reason ?? '',
    createdBy: ctx.viewer?.accountId ?? 0,
  }
}

// 入库类（采购收货、手工入库、盘盈）：每行生成一个批次
export async function addStock(
  ctx: WriteContext,
  doc: StockDoc,
  lines: StockLine[],
  type: 'po_in' | 'manual_in' | 'check_gain',
) {
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
        sourceType: doc.type,
        sourceId: doc.id,
        qty: line.qty,
        leftQty: line.qty,
        createdBy: ctx.viewer?.accountId ?? 0,
      })
      .returning()
    await ctx.tx.insert(stockMoves).values({
      ...moveOf(ctx, doc, type),
      materialId: line.materialId,
      batchId: found(batch).id,
      qty: line.qty,
    })
  }
}

// 出库类：先扣本单入库的批次（退货、作废入库类单据），再按入库时间先进先出；库存不够整单不扣
export async function deductStock(
  ctx: WriteContext,
  doc: StockDoc,
  lines: StockLine[],
  input: {
    type: 'po_return' | 'po_void' | 'in_void' | 'manual_out' | 'loss' | 'check_loss'
    ownFirst: boolean
    short: (line: StockLine, total: number) => string
  },
) {
  const ids = lines.map((line) => line.materialId)
  await lockStockMaterials(ctx, ids)
  const batches = await ctx.tx
    .select()
    .from(stockBatches)
    .where(inArray(stockBatches.materialId, ids))
    .orderBy(asc(stockBatches.materialId), asc(stockBatches.id))
    .for('update')
  for (const line of lines) {
    if (line.qty === 0) continue
    const available = batches.filter(
      (batch) => batch.materialId === line.materialId && batch.leftQty > 0,
    )
    const total = available.reduce((sum, batch) => sum + batch.leftQty, 0)
    if (total < line.qty) throw appError.businessRule(input.short(line, total))
    const own = (batch: (typeof available)[number]) =>
      input.ownFirst && batch.sourceType === doc.type && batch.sourceId === doc.id
    available.sort(
      (a, b) => Number(own(b)) - Number(own(a)) || a.inDate.localeCompare(b.inDate) || a.id - b.id,
    )
    let left = line.qty
    for (const batch of available) {
      if (left === 0) break
      const qty = Math.min(left, batch.leftQty)
      await ctx.tx
        .update(stockBatches)
        .set({ leftQty: sql`${stockBatches.leftQty} - ${qty}` })
        .where(eq(stockBatches.id, batch.id))
      await ctx.tx.insert(stockMoves).values({
        ...moveOf(ctx, doc, input.type),
        materialId: line.materialId,
        batchId: batch.id,
        qty: -qty,
      })
      batch.leftQty -= qty
      left -= qty
    }
  }
}

// 作废手工出库、报损：按原流水扣的批次逐条加回，不新建批次
export async function restoreStock(
  ctx: WriteContext,
  doc: StockDoc,
  input: { from: 'manual_out' | 'loss'; type: 'out_void' | 'loss_void' },
) {
  const moves = await ctx.tx
    .select()
    .from(stockMoves)
    .where(
      and(
        eq(stockMoves.docType, doc.type),
        eq(stockMoves.docId, doc.id),
        eq(stockMoves.type, input.from),
        lt(stockMoves.qty, 0),
      ),
    )
    .orderBy(asc(stockMoves.id))
  await lockStockMaterials(ctx, [...new Set(moves.map((move) => move.materialId))])
  await ctx.tx
    .select({ id: stockBatches.id })
    .from(stockBatches)
    .where(
      inArray(
        stockBatches.id,
        moves.map((move) => move.batchId),
      ),
    )
    .orderBy(asc(stockBatches.id))
    .for('update')
  for (const move of moves) {
    await ctx.tx
      .update(stockBatches)
      .set({ leftQty: sql`${stockBatches.leftQty} + ${-move.qty}` })
      .where(eq(stockBatches.id, move.batchId))
    await ctx.tx.insert(stockMoves).values({
      ...moveOf(ctx, doc, input.type),
      materialId: move.materialId,
      batchId: move.batchId,
      qty: -move.qty,
    })
  }
}

// 采购收货、退货、作废已收货采购单（阶段 4 的调用方）
export function receiveStock(ctx: WriteContext, doc: Omit<StockDoc, 'type'>, lines: StockLine[]) {
  return addStock(ctx, { ...doc, type: 'po' }, lines, 'po_in')
}
export function returnStock(
  ctx: WriteContext,
  doc: Omit<StockDoc, 'type'>,
  lines: StockLine[],
  type: 'po_return' | 'po_void' = 'po_return',
) {
  return deductStock(ctx, { ...doc, type: 'po' }, lines, {
    type,
    ownFirst: true,
    short: (line, total) =>
      type === 'po_void'
        ? copy.stock.voidStockShort
        : copy.finance.returnStock(line.name, total, line.unit),
  })
}
