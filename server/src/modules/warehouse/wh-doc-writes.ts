// 手工入库、手工出库、报损：新建、改单价（只对手工入库）、作废（05 章第 9 节、03 章第 8.3 节）
import { appError, contract, copy, type WhDocDetail } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import {
  materials,
  outCategories,
  priceChanges,
  whDocImages,
  whDocLines,
  whDocs,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import { actorLabelOf, type Viewer } from '../../common/domain/viewer.ts'
import { priceChangesText } from '../../common/domain/log-view.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import {
  lockSupplierLedger,
  notifySupplierFinance,
  owns,
  assertSourceUnstatemented,
} from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { FilesService } from '../files/files.service.ts'
import { addStock, deductStock, restoreStock, type StockDoc } from './stock-writes.ts'
import { WhDocReads } from './wh-doc-reads.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>['body']
type Doc = typeof whDocs.$inferSelect

const LOG_KIND = {
  in: copy.stock.log.kindStockIn,
  out: copy.stock.log.kindStockOut,
  loss: copy.stock.log.kindLoss,
} as const
const CREATE_ACTION = {
  in: copy.stock.log.stockIn,
  out: copy.stock.log.stockOut,
  loss: copy.stock.log.loss,
} as const
const VOID_ACTION = {
  in: copy.stock.log.voidStockIn,
  out: copy.stock.log.voidStockOut,
  loss: copy.stock.log.voidLoss,
} as const
const PREFIX = { in: 'RK', out: 'CK', loss: 'BS' } as const
const STATUS = { in: 'stocked_in', out: 'stocked_out', loss: 'lost' } as const

function docLog(doc: Pick<Doc, 'id' | 'no' | 'kind'>, action: string) {
  return {
    module: 'warehouse' as const,
    kind: LOG_KIND[doc.kind],
    action,
    targetType: 'wh_docs',
    targetId: doc.id,
    targetLabel: doc.no,
  }
}
function stockDocOf(
  doc: Pick<Doc, 'id' | 'no' | 'reason'>,
  date: string,
  reason = doc.reason,
): StockDoc {
  return { type: 'wh', id: doc.id, no: doc.no, date, reason }
}

@Injectable()
export class WhDocWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: WhDocReads,
    private readonly files: FilesService,
    private readonly clock: Clock,
  ) {}

  create(viewer: Viewer, input: In<'createWhDoc'>, key: string): Promise<WhDocDetail> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        // 手工入库影响应付：先锁供应商账本（05 章第 10.1 节锁序）
        if (input.kind === 'in') await this.assertSupplier(ctx, Number(input.supplierId))
        if (input.kind === 'out') await this.assertOutCategory(ctx, Number(input.outCategoryId))
        const imageIds = input.kind === 'loss' ? input.imageFileIds.map(Number) : []
        if (new Set(imageIds).size !== imageIds.length)
          throw appError.businessRule(copy.file.missing)
        await this.files.assertUsable(ctx.tx, viewer, 'loss_image', imageIds)
        const lines = await this.linesOf(ctx, input)
        const [row] = await ctx.tx
          .insert(whDocs)
          .values({
            no: await ctx.nextDocNo(PREFIX[input.kind]),
            kind: input.kind,
            docDate: this.clock.today(),
            status: STATUS[input.kind],
            supplierId: input.kind === 'in' ? Number(input.supplierId) : null,
            outCategoryId: input.kind === 'out' ? Number(input.outCategoryId) : null,
            reason: input.reason,
            createdBy: viewer.accountId,
          })
          .returning()
        const doc = found(row)
        await this.insertLines(ctx, doc, lines, imageIds)
        await this.moveStock(ctx, doc, lines)
        await ctx.log({
          ...docLog(doc, CREATE_ACTION[doc.kind]),
          reason: input.reason,
          after: {
            [copy.records.poChange]: lines
              .map((line) => `${line.name} ${line.qty} ${line.unit}`)
              .join(copy.separator),
          },
        })
        await this.notify(ctx, doc)
        return this.reads.detail(ctx.tx, viewer, doc.id)
      },
      {
        endpoint: contract.createWhDoc,
        key,
        replay: (tx, response) =>
          this.reads.detail(tx, viewer, Number((response as { id: string }).id)),
      },
    )
  }

  private async insertLines(
    ctx: WriteContext,
    doc: Doc,
    lines: Awaited<ReturnType<WhDocWrites['linesOf']>>,
    imageIds: number[],
  ) {
    await ctx.tx.insert(whDocLines).values(
      lines.map((line, sort) => ({
        docId: doc.id,
        materialId: line.materialId,
        name: line.name,
        unit: line.unit,
        qty: line.qty,
        priceCents: line.priceCents,
        orderPriceCents: line.priceCents,
        sort,
        createdBy: ctx.viewer?.accountId ?? 0,
      })),
    )
    if (imageIds.length)
      await ctx.tx.insert(whDocImages).values(
        imageIds.map((fileId, sort) => ({
          docId: doc.id,
          fileId,
          sort,
          createdBy: ctx.viewer?.accountId ?? 0,
        })),
      )
  }

  reprice(viewer: Viewer, id: number, input: In<'repriceWhDoc'>) {
    return this.writes.run(viewer, async (ctx) => {
      const doc = await this.lock(ctx, id)
      if (doc.kind === 'in') await assertSourceUnstatemented(ctx.tx, 'wh', id)
      const detail = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(detail, {
        code: 'reprice',
        version: input.version,
        missing: doc.status === 'voided' ? copy.stock.voidedNoReprice : copy.stock.docStale,
        stale: copy.stock.docStale,
      })
      if (input.lines.some((line) => !detail.lines.some((old) => old.id === line.lineId)))
        throw appError.businessRule(copy.stock.linesChanged)
      const changes = detail.lines.flatMap((old) => {
        const line = input.lines.find((row) => row.lineId === old.id)
        return line && old.priceCents !== line.priceCents
          ? [
              {
                name: old.name,
                fromCents: old.priceCents ?? 0,
                toCents: line.priceCents,
                qty: old.qty,
              },
            ]
          : []
      })
      if (changes.length === 0) throw appError.businessRule(copy.error.noChange)
      for (const line of input.lines)
        await ctx.tx
          .update(whDocLines)
          .set({ priceCents: line.priceCents })
          .where(eq(whDocLines.id, Number(line.lineId)))
      await ctx.tx.insert(priceChanges).values({
        whDocId: id,
        actorLabel: actorLabelOf(viewer),
        reason: input.reason,
        items: changes,
        createdBy: viewer.accountId,
      })
      await this.bump(ctx, id)
      await ctx.log({
        ...docLog(doc, copy.stock.log.reprice),
        reason: input.reason,
        after: { [copy.records.priceChange]: priceChangesText(changes) },
      })
      await this.notify(ctx, { ...doc, version: doc.version + 1 })
      return this.reads.detail(ctx.tx, viewer, id)
    })
  }

  void(viewer: Viewer, id: number, input: In<'voidWhDoc'>) {
    return this.writes.run(viewer, async (ctx) => {
      const doc = await this.lock(ctx, id)
      if (!owns(viewer, doc.createdBy)) throw appError.forbidden()
      if (doc.kind === 'in') await assertSourceUnstatemented(ctx.tx, 'wh', id)
      const detail = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(detail, {
        code: 'void',
        version: input.version,
        missing: doc.status === 'voided' ? copy.stock.voided : copy.stock.docStale,
        stale: copy.stock.docStale,
      })
      const stockDoc = stockDocOf(doc, this.clock.today(), input.reason)
      if (doc.kind === 'in')
        await deductStock(
          ctx,
          stockDoc,
          detail.lines.map((line) => ({ ...line, materialId: Number(line.materialId) })),
          { type: 'in_void', ownFirst: true, short: () => copy.stock.voidStockShort },
        )
      else
        await restoreStock(ctx, stockDoc, {
          from: doc.kind === 'out' ? 'manual_out' : 'loss',
          type: doc.kind === 'out' ? 'out_void' : 'loss_void',
        })
      await ctx.tx
        .update(whDocs)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: this.clock.now(),
          version: sql`${whDocs.version} + 1`,
        })
        .where(eq(whDocs.id, id))
      await ctx.log({ ...docLog(doc, VOID_ACTION[doc.kind]), reason: input.reason })
      await this.notify(ctx, { ...doc, version: doc.version + 1 })
      return this.reads.detail(ctx.tx, viewer, id)
    })
  }

  // 锁序：供应商（手工入库）→ 单据；花材、批次在库存函数里锁
  private async lock(ctx: WriteContext, id: number): Promise<Doc> {
    const pointer = found((await ctx.tx.select().from(whDocs).where(eq(whDocs.id, id)))[0])
    if (pointer.supplierId !== null) await lockSupplierLedger(ctx.tx, pointer.supplierId)
    return found((await ctx.tx.select().from(whDocs).where(eq(whDocs.id, id)).for('update'))[0])
  }
  private async bump(ctx: WriteContext, id: number) {
    await ctx.tx
      .update(whDocs)
      .set({ version: sql`${whDocs.version} + 1` })
      .where(eq(whDocs.id, id))
  }
  private async assertSupplier(ctx: WriteContext, id: number) {
    const supplier = await lockSupplierLedger(ctx.tx, id)
    if (!supplier.enabled) throw appError.validation({ supplierId: copy.stock.supplierDisabled })
  }
  private async assertOutCategory(ctx: WriteContext, id: number) {
    const [category] = await ctx.tx
      .select()
      .from(outCategories)
      .where(eq(outCategories.id, id))
      .for('share')
    if (!category) throw appError.notFound()
    if (!category.enabled)
      throw appError.validation({ outCategoryId: copy.stock.outCategoryDisabled })
  }
  // 名称、单位按当时的花材快照；停用的花材不能入库，还能出库、报损（03 章第 8.3 节）
  private async linesOf(ctx: WriteContext, input: In<'createWhDoc'>) {
    const ids = input.lines.map((line) => Number(line.materialId))
    const rows = await ctx.tx
      .select()
      .from(materials)
      .where(inArray(materials.id, ids))
      .orderBy(asc(materials.id))
      .for('update')
    return input.lines.map((line) => {
      const material = found(rows.find((row) => row.id === Number(line.materialId)))
      if (input.kind === 'in' && !material.enabled)
        throw appError.businessRule(copy.stock.materialDisabled(material.name))
      return {
        materialId: material.id,
        name: material.name,
        unit: material.unit,
        qty: line.qty,
        priceCents: 'priceCents' in line ? line.priceCents : null,
      }
    })
  }
  private async moveStock(
    ctx: WriteContext,
    doc: Doc,
    lines: Awaited<ReturnType<WhDocWrites['linesOf']>>,
  ) {
    const stockDoc = stockDocOf(doc, doc.docDate)
    if (doc.kind === 'in') return addStock(ctx, stockDoc, lines, 'manual_in')
    const verb = doc.kind === 'out' ? copy.stock.verbOut : copy.stock.verbLoss
    return deductStock(ctx, stockDoc, lines, {
      type: doc.kind === 'out' ? 'manual_out' : 'loss',
      ownFirst: false,
      short: (line, total) => copy.stock.stockShort(line.name, total, line.unit, verb),
    })
  }
  private async notify(ctx: WriteContext, doc: Pick<Doc, 'id' | 'version' | 'supplierId'>) {
    ctx.notify([
      { topic: `wh_doc:${doc.id}`, version: doc.version },
      { topic: 'wh_docs', version: null },
      { topic: 'stock', version: null },
      { topic: 'demand', version: null },
    ])
    if (doc.supplierId !== null) await notifySupplierFinance(ctx, doc.supplierId)
  }
}
