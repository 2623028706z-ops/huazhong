// 产品分类（05 章第 4 节主数据）：新增、改名、排序、删除（分类下有产品，含停用的，不能删）
import { appError, contract, copy, type OutputOf, type ProductCategory } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { productCategories, products } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService } from '../../common/write.service.ts'
import type { Executor } from './order-rows.ts'

const NAME_FIELDS = { product_categories_name_unique: { name: copy.catalog.categoryNameTaken } }

function categoryLog(row: { id: number; name: string }, action: string) {
  return {
    module: 'sales' as const,
    kind: copy.log.kind.category,
    action,
    targetType: 'product_categories',
    targetId: row.id,
    targetLabel: row.name,
  }
}

async function categoriesOf(executor: Executor): Promise<ProductCategory[]> {
  const productCount = executor
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.categoryId, productCategories.id))
  const rows = await executor
    .select({
      id: productCategories.id,
      name: productCategories.name,
      sort: productCategories.sort,
      productCount: sql<number>`(${productCount})`,
    })
    .from(productCategories)
    .orderBy(asc(productCategories.sort), asc(productCategories.id))
  return rows.map((row) => ({ ...row, id: String(row.id) }))
}

async function categoryOf(executor: Executor, id: number): Promise<ProductCategory> {
  return found((await categoriesOf(executor)).find((row) => row.id === String(id)))
}

async function assertNameFree(tx: Tx, name: string, exceptId: number | null): Promise<void> {
  const [taken] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.name, name),
        exceptId === null ? undefined : ne(productCategories.id, exceptId),
      ),
    )
  if (taken) throw appError.validation({ name: copy.catalog.categoryNameTaken })
}

const pageOfCategories = (items: ProductCategory[]) => ({ items, nextCursor: null, actions: [] })

@Injectable()
export class CategoryService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
  ) {}

  async list(): Promise<OutputOf<typeof contract.listProductCategories>> {
    return pageOfCategories(await categoriesOf(this.db))
  }

  // 新增的排在最后
  create(viewer: Viewer, name: string, idempotencyKey: string): Promise<ProductCategory> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await assertNameFree(ctx.tx, name, null)
            const [last] = await ctx.tx
              .select({ sort: sql<number>`coalesce(max(${productCategories.sort}), 0)::int` })
              .from(productCategories)
            const [row] = await ctx.tx
              .insert(productCategories)
              .values({ name, sort: (last?.sort ?? 0) + 1, createdBy: viewer.accountId })
              .returning({ id: productCategories.id })
            if (!row) throw appError.internal()
            await ctx.log(categoryLog({ id: row.id, name }, copy.log.action.createCategory))
            return categoryOf(ctx.tx, row.id)
          },
          { endpoint: contract.createProductCategory, key: idempotencyKey },
        ),
      NAME_FIELDS,
    )
  }

  rename(viewer: Viewer, id: number, name: string): Promise<ProductCategory> {
    return guardUnique(
      () =>
        this.writes.run(viewer, async (ctx) => {
          const [row] = await ctx.tx
            .select()
            .from(productCategories)
            .where(eq(productCategories.id, id))
            .for('update')
          const before = found(row)
          if (before.name === name) throw appError.businessRule(copy.error.noChange)
          await assertNameFree(ctx.tx, name, id)
          await ctx.tx.update(productCategories).set({ name }).where(eq(productCategories.id, id))
          await ctx.log({
            ...categoryLog({ id, name }, copy.log.action.updateCategory),
            before: { [copy.field.objectName]: before.name },
            after: { [copy.field.objectName]: name },
          })
          return categoryOf(ctx.tx, id)
        }),
      NAME_FIELDS,
    )
  }

  // ids 必须正好是现有全部分类，否则 STALE（别人刚加、删了分类）
  reorder(
    viewer: Viewer,
    ids: readonly string[],
  ): Promise<OutputOf<typeof contract.orderProductCategories>> {
    return this.writes.run(viewer, async (ctx) => {
      const rows = await ctx.tx
        .select()
        .from(productCategories)
        .orderBy(asc(productCategories.sort), asc(productCategories.id))
        .for('update')
      const existing = rows.map((row) => String(row.id))
      const sameSet =
        ids.length === existing.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => existing.includes(id))
      if (!sameSet) {
        throw appError.stale(
          copy.catalog.categoryStale,
          pageOfCategories(await categoriesOf(ctx.tx)),
        )
      }
      if (ids.every((id, index) => existing[index] === id)) {
        ctx.unchanged()
        return pageOfCategories(await categoriesOf(ctx.tx))
      }
      for (const [index, id] of ids.entries()) {
        await ctx.tx
          .update(productCategories)
          .set({ sort: index + 1 })
          .where(eq(productCategories.id, Number(id)))
      }
      const nameOf = (id: string) => rows.find((row) => String(row.id) === id)?.name ?? ''
      await ctx.log({
        module: 'sales',
        kind: copy.log.kind.category,
        action: copy.log.action.orderCategories,
        targetType: 'product_categories',
        targetId: null,
        targetLabel: copy.log.kind.category,
        before: { [copy.field.sort]: existing.map(nameOf).join(copy.order.nameSeparator) },
        after: { [copy.field.sort]: ids.map(nameOf).join(copy.order.nameSeparator) },
      })
      return pageOfCategories(await categoriesOf(ctx.tx))
    })
  }

  remove(viewer: Viewer, id: number): Promise<Record<string, never>> {
    return this.writes.run(viewer, async (ctx) => {
      const [row] = await ctx.tx
        .select()
        .from(productCategories)
        .where(eq(productCategories.id, id))
        .for('update')
      const category = found(row)
      const [used] = await ctx.tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.categoryId, id))
        .limit(1)
      if (used) throw appError.businessRule(copy.catalog.categoryNotEmpty)
      await ctx.tx.delete(productCategories).where(eq(productCategories.id, id))
      await ctx.log(categoryLog(category, copy.log.action.deleteCategory))
      return {}
    })
  }
}
