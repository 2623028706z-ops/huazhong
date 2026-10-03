import { appError, contract, copy, type OutputOf, type StocktakeDraft } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  accounts,
  materialCategories,
  materials,
  stockBatches,
  stocktakeLines,
  stocktakes,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { addStock, deductStock } from './stock-writes.ts'

@Injectable()
export class Stocktakes {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}
  async draft(categoryIds: string[], executor: Db | Tx = this.db): Promise<StocktakeDraft> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.draft(categoryIds, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const ids = [...new Set(categoryIds.map(Number))]
    const categories = await executor
      .select()
      .from(materialCategories)
      .where(inArray(materialCategories.id, ids))
      .orderBy(asc(materialCategories.sort), asc(materialCategories.id))
    if (categories.length !== ids.length) throw appError.notFound()
    const rows = await executor
      .select()
      .from(materials)
      .where(inArray(materials.categoryId, ids))
      .orderBy(asc(materials.code), asc(materials.id))
    const batches = rows.length
      ? await executor
          .select()
          .from(stockBatches)
          .where(
            inArray(
              stockBatches.materialId,
              rows.map((row) => row.id),
            ),
          )
      : []
    return {
      categories: categories.map((row) => ({ id: String(row.id), name: row.name })),
      lines: rows.map((row) => ({
        materialId: String(row.id),
        name: row.name,
        code: row.code,
        unit: row.unit,
        enabled: row.enabled,
        bookQty: batches
          .filter((batch) => batch.materialId === row.id)
          .reduce((sum, batch) => sum + batch.leftQty, 0),
      })),
    }
  }
  async list(
    query: ParsedInput<typeof contract.listStocktakes>['query'],
  ): Promise<OutputOf<typeof contract.listStocktakes>> {
    return this.db.transaction(
      async (tx) => {
        const rows = await tx
          .select()
          .from(stocktakes)
          .where(beforeCursor(stocktakes.checkDate, stocktakes.id, query.cursor))
          .orderBy(desc(stocktakes.checkDate), desc(stocktakes.id))
          .limit(query.limit + 1)
        const page = pageOf(rows, query.limit, (row) => [row.checkDate, row.id])
        return {
          items: await Promise.all(page.items.map((row) => this.detail(row.id, tx))),
          nextCursor: page.nextCursor,
          actions: [enabledAction('create', null)],
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
  async detail(
    id: number,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.getStocktake>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.detail(id, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const row = found(
      (
        await executor
          .select({ doc: stocktakes, actorName: accounts.name })
          .from(stocktakes)
          .innerJoin(accounts, eq(accounts.id, stocktakes.createdBy))
          .where(eq(stocktakes.id, id))
      )[0],
    )
    const lines = await executor
      .select()
      .from(stocktakeLines)
      .where(eq(stocktakeLines.stocktakeId, id))
      .orderBy(asc(stocktakeLines.sort), asc(stocktakeLines.id))
    return {
      id: String(id),
      no: row.doc.no,
      checkDate: row.doc.checkDate,
      status: row.doc.status,
      categories: row.doc.categories,
      lineCount: lines.length,
      diffCount: lines.filter((line) => line.diffQty !== 0).length,
      actorName: row.actorName,
      actions: [],
      lockedReason: null,
      reason: row.doc.reason || null,
      createdAt: row.doc.createdAt.toISOString(),
      lines: lines.map((line) => ({
        materialId: String(line.materialId),
        name: line.name,
        unit: line.unit,
        bookQty: line.bookQty,
        actualQty: line.actualQty,
        diffQty: line.diffQty ?? 0,
      })),
    }
  }
  create(viewer: Viewer, input: ParsedInput<typeof contract.createStocktake>['body'], key: string) {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const latest = await this.validate(ctx, input)
        const { doc, lines } = await this.store(ctx, input, latest)
        await this.adjust(ctx, doc, lines)
        await ctx.log({
          module: 'warehouse',
          kind: copy.stock.log.kindStocktake,
          action: copy.stock.log.stocktake,
          targetType: 'stocktakes',
          targetId: doc.id,
          targetLabel: doc.no,
          reason: input.reason,
          after: lines,
        })
        ctx.notify([
          { topic: 'stock', version: null },
          { topic: 'demand', version: null },
        ])
        return this.detail(doc.id, ctx.tx)
      },
      {
        endpoint: contract.createStocktake,
        key,
        replay: (tx, response) => this.detail(Number((response as { id: string }).id), tx),
      },
    )
  }
  private async validate(
    ctx: WriteContext,
    input: ParsedInput<typeof contract.createStocktake>['body'],
  ) {
    await ctx.tx
      .select({ id: materialCategories.id })
      .from(materialCategories)
      .where(inArray(materialCategories.id, input.categoryIds.map(Number)))
      .orderBy(asc(materialCategories.id))
      .for('share')
    // 先锁花材行再锁表：改花材是先锁行再更新，顺序反过来会互相等待（死锁）。
    // 锁行之后才进分类的新花材，由下面的复查报「明细变了」。
    await ctx.tx
      .select({ id: materials.id })
      .from(materials)
      .where(inArray(materials.categoryId, input.categoryIds.map(Number)))
      .orderBy(asc(materials.id))
      .for('update')
    await ctx.tx.execute(sql`LOCK TABLE materials IN SHARE MODE`)
    const latest = await this.draft(input.categoryIds, ctx.tx)
    if (
      input.lines.length !== latest.lines.length ||
      latest.lines.some((row) => !input.lines.some((line) => line.materialId === row.materialId))
    )
      throw appError.stale(copy.stock.stocktakeLinesChanged, latest)
    if (
      latest.lines.some(
        (row) =>
          input.lines.find((line) => line.materialId === row.materialId)?.bookQty !== row.bookQty,
      )
    )
      throw appError.stale(copy.stock.stocktakeStale, latest)
    return latest
  }
  private async store(
    ctx: WriteContext,
    input: ParsedInput<typeof contract.createStocktake>['body'],
    latest: StocktakeDraft,
  ) {
    const doc = found(
      (
        await ctx.tx
          .insert(stocktakes)
          .values({
            no: await ctx.nextDocNo('PD'),
            checkDate: this.clock.today(),
            categories: latest.categories.map((row) => row.name),
            reason: input.reason,
            createdBy: ctx.viewer?.accountId ?? 0,
          })
          .returning()
      )[0],
    )
    const lines = latest.lines.map((row, sort) => ({
      ...row,
      actualQty: found(input.lines.find((line) => line.materialId === row.materialId)).actualQty,
      sort,
    }))
    if (lines.length)
      await ctx.tx.insert(stocktakeLines).values(
        lines.map((line) => ({
          stocktakeId: doc.id,
          materialId: Number(line.materialId),
          name: line.name,
          unit: line.unit,
          bookQty: line.bookQty,
          actualQty: line.actualQty,
          sort: line.sort,
          createdBy: ctx.viewer?.accountId ?? 0,
        })),
      )
    return { doc, lines }
  }
  private async adjust(
    ctx: WriteContext,
    doc: typeof stocktakes.$inferSelect,
    lines: Awaited<ReturnType<Stocktakes['store']>>['lines'],
  ) {
    const stockDoc = {
      type: 'stocktake' as const,
      id: doc.id,
      no: doc.no,
      date: doc.checkDate,
      reason: doc.reason,
    }
    const toStock = (line: (typeof lines)[number]) => ({
      materialId: Number(line.materialId),
      name: line.name,
      unit: line.unit,
      qty: Math.abs(line.actualQty - line.bookQty),
    })
    const gains = lines.filter((line) => line.actualQty > line.bookQty).map(toStock)
    const losses = lines.filter((line) => line.actualQty < line.bookQty).map(toStock)
    if (gains.length) await addStock(ctx, stockDoc, gains, 'check_gain')
    if (losses.length)
      await deductStock(ctx, stockDoc, losses, {
        type: 'check_loss',
        ownFirst: false,
        short: () => copy.stock.stocktakeStale,
      })
  }
}
