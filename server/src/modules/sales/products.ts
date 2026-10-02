// 产品和配方（05 章第 4 节主数据）：名称不重复，配方至少一种花材，配方花材必须存在（新加的还须启用）
import {
  appError,
  contract,
  copy,
  formatQty,
  type OutputOf,
  type ProductCreate,
  type ProductItem,
  type ProductUpdate,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  catalogItems,
  materials,
  productBomLines,
  productCategories,
  products,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { actionOf } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { FilesService } from '../files/files.service.ts'
import { bomLinesOf } from './bom.ts'
import type { Executor } from './order-rows.ts'

const NAME_FIELDS = { products_name_unique: { name: copy.catalog.productNameTaken } }

type ProductInput = Omit<ProductCreate, never>

function productLog(item: { id: string; name: string }, action: string) {
  return {
    module: 'sales' as const,
    kind: copy.log.kind.product,
    action,
    targetType: 'products',
    targetId: Number(item.id),
    targetLabel: item.name,
  }
}

function productView(item: ProductItem): Record<string, string> {
  const bom = item.bom
    .map((line) => `${line.materialName} ${formatQty(line.qty, line.unit)}`)
    .join(copy.order.nameSeparator)
  return {
    [copy.field.name]: item.name,
    [copy.field.category]: item.categoryName,
    [copy.field.unit]: item.unit,
    [copy.field.bom]: bom,
    [copy.field.status]: item.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}

function sameInput(item: ProductItem, input: ProductInput): boolean {
  const bomOf = (lines: readonly { materialId: string; qty: number }[]) =>
    JSON.stringify(lines.map((line) => [line.materialId, line.qty]))
  return (
    item.name === input.name &&
    item.categoryId === input.categoryId &&
    item.unit === input.unit &&
    item.imageFileId === input.imageFileId &&
    item.enabled === input.enabled &&
    bomOf(item.bom) === bomOf(input.bom)
  )
}

@Injectable()
export class ProductService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly files: FilesService,
  ) {}

  private async items(executor: Executor, where: SQL | undefined): Promise<ProductItem[]> {
    const rows = await executor
      .select({
        id: products.id,
        version: products.version,
        name: products.name,
        categoryId: products.categoryId,
        categoryName: productCategories.name,
        unit: products.unit,
        enabled: products.enabled,
        imageFileId: products.imageFileId,
      })
      .from(products)
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(where)
      .orderBy(asc(productCategories.sort), asc(productCategories.id), asc(products.id))
    const ids = rows.map((row) => row.id)
    const bom = await bomLinesOf(executor, ids)
    const imageIds = rows.flatMap((row) => (row.imageFileId === null ? [] : [row.imageFileId]))
    const urls = await this.files.urlsOf(executor, imageIds)
    return rows.map((row) => ({
      ...row,
      id: String(row.id),
      categoryId: String(row.categoryId),
      imageFileId: row.imageFileId === null ? null : String(row.imageFileId),
      imageUrl: row.imageFileId === null ? null : (urls.get(row.imageFileId)?.url ?? null),
      bom: bom.get(row.id) ?? [],
    }))
  }

  private async item(executor: Executor, id: number): Promise<ProductItem> {
    return found((await this.items(executor, eq(products.id, id)))[0])
  }

  async list(
    viewer: Viewer,
    query: { categoryId?: string | undefined },
  ): Promise<OutputOf<typeof contract.listProducts>> {
    const where =
      query.categoryId === undefined ? undefined : eq(products.categoryId, Number(query.categoryId))
    const sales = viewer.modules.includes('sales')
    return {
      items: await this.items(this.db, where),
      nextCursor: null,
      actions: sales
        ? [actionOf('create', null, null), actionOf('manageCategories', null, null)]
        : [],
    }
  }

  // 分类存在；配方花材都存在，不在原配方里的还须启用；产品图须已上传通过
  private async assertRefs(
    ctx: WriteContext,
    input: ProductInput,
    kept: ProductItem | null,
  ): Promise<void> {
    const [category] = await ctx.tx
      .select({ id: productCategories.id })
      .from(productCategories)
      .where(eq(productCategories.id, Number(input.categoryId)))
    if (!category) throw appError.validation({ categoryId: copy.catalog.categoryRequired })
    const ids = input.bom.map((line) => Number(line.materialId))
    const rows = await ctx.tx
      .select({ id: materials.id, enabled: materials.enabled })
      .from(materials)
      .where(inArray(materials.id, ids))
    const keptIds = new Set(kept?.bom.map((line) => Number(line.materialId)) ?? [])
    const usable = ids.every((id) => {
      const row = rows.find((r) => r.id === id)
      return row !== undefined && (row.enabled || keptIds.has(id))
    })
    if (!usable) throw appError.validation({ bom: copy.catalog.bomMaterialUnavailable })
    const imageId = input.imageFileId
    if (imageId !== null && imageId !== kept?.imageFileId && ctx.viewer) {
      await this.files.assertUsable(ctx.tx, ctx.viewer, 'product_image', [Number(imageId)])
    }
  }

  private async assertNameFree(tx: Tx, name: string, exceptId: number | null) {
    const [taken] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.name, name), exceptId === null ? undefined : ne(products.id, exceptId)),
      )
    if (taken) throw appError.validation({ name: copy.catalog.productNameTaken })
  }

  private async saveBom(tx: Tx, productId: number, input: ProductInput, createdBy: number) {
    await tx.delete(productBomLines).where(eq(productBomLines.productId, productId))
    await tx.insert(productBomLines).values(
      input.bom.map((line) => ({
        productId,
        materialId: Number(line.materialId),
        qty: line.qty,
        createdBy,
      })),
    )
  }

  create(viewer: Viewer, input: ProductCreate, idempotencyKey: string): Promise<ProductItem> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await this.assertNameFree(ctx.tx, input.name, null)
            await this.assertRefs(ctx, input, null)
            const [row] = await ctx.tx
              .insert(products)
              .values({
                name: input.name,
                categoryId: Number(input.categoryId),
                unit: input.unit,
                imageFileId: input.imageFileId === null ? null : Number(input.imageFileId),
                enabled: input.enabled,
                createdBy: viewer.accountId,
              })
              .returning({ id: products.id })
            if (!row) throw appError.internal()
            await this.saveBom(ctx.tx, row.id, input, viewer.accountId)
            const item = await this.item(ctx.tx, row.id)
            await ctx.log({
              ...productLog(item, copy.log.action.createProduct),
              after: productView(item),
            })
            return item
          },
          { endpoint: contract.createProduct, key: idempotencyKey },
        ),
      NAME_FIELDS,
    )
  }

  // 订货目录弹层改配方：在目录的同一事务里只换配方，其余照旧；配方没变返回 false。
  // 产品先行锁再核对版本（stale 由目录给出最新目录）
  async replaceBomIn(
    ctx: WriteContext,
    id: number,
    input: { version: number; bom: ProductInput['bom'] },
    stale: () => Promise<never>,
  ): Promise<boolean> {
    const [locked] = await ctx.tx
      .select({ version: products.version })
      .from(products)
      .where(eq(products.id, id))
      .for('update')
    if (found(locked).version !== input.version) return stale()
    const before = await this.item(ctx.tx, id)
    const next = { ...before, bom: input.bom }
    if (sameInput(before, next)) return false
    if (!ctx.viewer) throw appError.internal()
    await this.updateInTx(ctx, ctx.viewer, id, next)
    return true
  }

  update(viewer: Viewer, id: number, input: ProductUpdate): Promise<ProductItem> {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.updateInTx(ctx, viewer, id, input)),
      NAME_FIELDS,
    )
  }

  private async updateInTx(
    ctx: WriteContext,
    viewer: Viewer,
    id: number,
    input: ProductUpdate,
  ): Promise<ProductItem> {
    const [locked] = await ctx.tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .for('update')
    found(locked)
    const before = await this.item(ctx.tx, id)
    if (before.version !== input.version) throw appError.stale(copy.catalog.productStale, before)
    if (sameInput(before, input)) throw appError.businessRule(copy.error.noChange)
    if (before.name !== input.name) await this.assertNameFree(ctx.tx, input.name, id)
    await this.assertRefs(ctx, input, before)
    await ctx.tx
      .update(products)
      .set({
        name: input.name,
        categoryId: Number(input.categoryId),
        unit: input.unit,
        imageFileId: input.imageFileId === null ? null : Number(input.imageFileId),
        enabled: input.enabled,
        version: sql`${products.version} + 1`,
      })
      .where(eq(products.id, id))
    await this.saveBom(ctx.tx, id, input, viewer.accountId)
    const item = await this.item(ctx.tx, id)
    await ctx.log({
      ...productLog(item, copy.log.action.updateProduct),
      before: productView(before),
      after: productView(item),
    })
    // 名称、单位、配方、启用都在目录里显示：目录里有它的客户都要刷新
    const owners = await ctx.tx
      .select({ customerId: catalogItems.customerId })
      .from(catalogItems)
      .where(eq(catalogItems.productId, id))
    ctx.notify([
      { topic: 'demand', version: null },
      ...owners.map((owner) => ({ topic: `catalog:${owner.customerId}` as const, version: null })),
    ])
    return item
  }
}
