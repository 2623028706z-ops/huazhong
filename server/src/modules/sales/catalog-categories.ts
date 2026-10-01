// 订货分类（05 章第 4 节）：每个客户一套，门店订货页按它分组。新增、改名、排序、删除，规则照产品分类：
// 同一客户内不重名，分类下有目录项（含停用的）不能删（2026-10-03 确认）。都返回整份目录
import { appError, contract, copy, type Catalog } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, ne, sql } from 'drizzle-orm'
import { catalogCategories, customers } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { catalogCategoriesOf, catalogOf } from './catalog.ts'

const NAME_FIELDS = { catalog_categories_name_unique: { name: copy.catalog.categoryNameTaken } }

@Injectable()
export class CatalogCategoryService {
  constructor(private readonly writes: WriteService) {}

  // 行锁客户：同一客户的分类写操作排队（新增排序号、整组排序）
  private async lockCustomer(ctx: WriteContext, customerId: number): Promise<string> {
    const [row] = await ctx.tx
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
      .for('update')
    return found(row).name
  }

  private async assertNameFree(
    ctx: WriteContext,
    customerId: number,
    name: string,
    exceptId: number | null,
  ): Promise<void> {
    const [taken] = await ctx.tx
      .select({ id: catalogCategories.id })
      .from(catalogCategories)
      .where(
        and(
          eq(catalogCategories.customerId, customerId),
          eq(catalogCategories.name, name),
          exceptId === null ? undefined : ne(catalogCategories.id, exceptId),
        ),
      )
    if (taken) throw appError.validation({ name: copy.catalog.categoryNameTaken })
  }

  private async log(
    ctx: WriteContext,
    customer: { id: number; name: string },
    action: string,
    change: { before?: Record<string, string>; after?: Record<string, string> },
  ): Promise<Catalog> {
    const customerId = customer.id
    await ctx.log({
      module: 'sales',
      kind: copy.log.kind.catalog,
      action,
      targetType: 'customers',
      targetId: customerId,
      targetLabel: customer.name,
      ...change,
    })
    ctx.notify([{ topic: `catalog:${customerId}`, version: null }])
    return catalogOf(ctx.tx, customerId)
  }

  // 新增的排在最后
  create(viewer: Viewer, customerId: number, name: string, key: string): Promise<Catalog> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            const customerName = await this.lockCustomer(ctx, customerId)
            await this.assertNameFree(ctx, customerId, name, null)
            const [last] = await ctx.tx
              .select({ sort: sql<number>`coalesce(max(${catalogCategories.sort}), 0)::int` })
              .from(catalogCategories)
              .where(eq(catalogCategories.customerId, customerId))
            await ctx.tx.insert(catalogCategories).values({
              customerId,
              name,
              sort: (last?.sort ?? 0) + 1,
              createdBy: viewer.accountId,
            })
            return this.log(
              ctx,
              { id: customerId, name: customerName },
              copy.log.action.createCategory,
              {
                after: { [copy.field.catalogCategory]: name },
              },
            )
          },
          { endpoint: contract.createCatalogCategory, key },
        ),
      NAME_FIELDS,
    )
  }

  rename(viewer: Viewer, customerId: number, id: number, name: string): Promise<Catalog> {
    return guardUnique(
      () =>
        this.writes.run(viewer, async (ctx) => {
          const customerName = await this.lockCustomer(ctx, customerId)
          const before = await this.categoryOf(ctx, customerId, id)
          if (before.name === name) throw appError.businessRule(copy.error.noChange)
          await this.assertNameFree(ctx, customerId, name, id)
          await ctx.tx.update(catalogCategories).set({ name }).where(eq(catalogCategories.id, id))
          return this.log(
            ctx,
            { id: customerId, name: customerName },
            copy.log.action.updateCategory,
            {
              before: { [copy.field.catalogCategory]: before.name },
              after: { [copy.field.catalogCategory]: name },
            },
          )
        }),
      NAME_FIELDS,
    )
  }

  // ids 必须正好是这个客户现有的全部分类，否则 STALE
  reorder(viewer: Viewer, customerId: number, ids: readonly string[]): Promise<Catalog> {
    return this.writes.run(viewer, async (ctx) => {
      const customerName = await this.lockCustomer(ctx, customerId)
      const rows = await catalogCategoriesOf(ctx.tx, customerId)
      const existing = rows.map((row) => row.id)
      const sameSet =
        ids.length === existing.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => existing.includes(id))
      if (!sameSet) {
        throw appError.stale(copy.catalog.categoryStale, await catalogOf(ctx.tx, customerId))
      }
      if (ids.every((id, index) => existing[index] === id)) {
        ctx.unchanged()
        return catalogOf(ctx.tx, customerId)
      }
      for (const [index, id] of ids.entries()) {
        await ctx.tx
          .update(catalogCategories)
          .set({ sort: index + 1 })
          .where(eq(catalogCategories.id, Number(id)))
      }
      const names = (list: readonly string[]) =>
        list
          .map((id) => rows.find((row) => row.id === id)?.name ?? '')
          .join(copy.order.nameSeparator)
      return this.log(
        ctx,
        { id: customerId, name: customerName },
        copy.log.action.orderCategories,
        {
          before: { [copy.field.sort]: names(existing) },
          after: { [copy.field.sort]: names(ids) },
        },
      )
    })
  }

  remove(viewer: Viewer, customerId: number, id: number): Promise<Catalog> {
    return this.writes.run(viewer, async (ctx) => {
      const customerName = await this.lockCustomer(ctx, customerId)
      const category = await this.categoryOf(ctx, customerId, id)
      if (category.itemCount > 0) throw appError.businessRule(copy.catalog.catalogCategoryNotEmpty)
      await ctx.tx.delete(catalogCategories).where(eq(catalogCategories.id, id))
      return this.log(ctx, { id: customerId, name: customerName }, copy.log.action.deleteCategory, {
        before: { [copy.field.catalogCategory]: category.name },
      })
    })
  }

  // 分类须属于这个客户
  private async categoryOf(ctx: WriteContext, customerId: number, id: number) {
    const rows = await catalogCategoriesOf(ctx.tx, customerId)
    return found(rows.find((row) => row.id === String(id)))
  }
}
