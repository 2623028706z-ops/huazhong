// 订货目录（05 章第 4 节）：每个客户一份价目和一套订货分类。改了目录价，同一事务把这个客户待确认订单里
// 这种产品的单价、目录价快照改成新价（订单 version +1），只记在「修改订货目录」日志里，不写变更记录（阶段 3 确认）。
// 目录弹层一次保存一个目录项，可以一起换产品本身的配方（所有客户共用，2026-10-03 确认）
import {
  appError,
  copy,
  formatMoney,
  type Catalog,
  type CatalogCategory,
  type CatalogItem,
  type CatalogItemSave,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  catalogCategories,
  catalogItems,
  customers,
  orderLines,
  orders,
  products,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { bomLinesOf } from './bom.ts'
import type { Executor } from './order-rows.ts'
import { ProductService } from './products.ts'

const CODE_FIELDS = {
  catalog_items_customer_code_unique: { customerCode: copy.catalog.customerCodeTaken },
}

export async function catalogCategoriesOf(
  executor: Executor,
  customerId: number,
): Promise<CatalogCategory[]> {
  const itemCount = executor
    .select({ total: sql<number>`count(*)::int` })
    .from(catalogItems)
    .where(eq(catalogItems.categoryId, catalogCategories.id))
  const rows = await executor
    .select({
      id: catalogCategories.id,
      name: catalogCategories.name,
      sort: catalogCategories.sort,
      itemCount: sql<number>`(${itemCount})`,
    })
    .from(catalogCategories)
    .where(eq(catalogCategories.customerId, customerId))
    .orderBy(asc(catalogCategories.sort), asc(catalogCategories.id))
  return rows.map((row) => ({ ...row, id: String(row.id) }))
}

async function itemsOf(executor: Executor, customerId: number): Promise<CatalogItem[]> {
  const rows = await executor
    .select({
      productId: catalogItems.productId,
      name: products.name,
      unit: products.unit,
      categoryId: catalogItems.categoryId,
      categoryName: catalogCategories.name,
      customerCode: catalogItems.customerCode,
      productEnabled: products.enabled,
      enabled: catalogItems.enabled,
      listPriceCents: catalogItems.priceCents,
      version: catalogItems.version,
      productVersion: products.version,
    })
    .from(catalogItems)
    .innerJoin(products, eq(products.id, catalogItems.productId))
    .innerJoin(catalogCategories, eq(catalogCategories.id, catalogItems.categoryId))
    .where(eq(catalogItems.customerId, customerId))
    .orderBy(asc(catalogCategories.sort), asc(catalogCategories.id), asc(products.id))
  const bom = await bomLinesOf(
    executor,
    rows.map((row) => row.productId),
  )
  return rows.map((row) => ({
    ...row,
    productId: String(row.productId),
    categoryId: String(row.categoryId),
    bom: bom.get(row.productId) ?? [],
  }))
}

export async function catalogOf(executor: Executor, customerId: number): Promise<Catalog> {
  const [customer] = await executor
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
  return {
    customerId: String(customerId),
    customerName: found(customer).name,
    categories: await catalogCategoriesOf(executor, customerId),
    items: await itemsOf(executor, customerId),
  }
}

// 日志里一个目录项的样子
function itemView(item: {
  categoryName: string
  customerCode: string
  priceCents: number
  enabled: boolean
}): Record<string, string> {
  return {
    [copy.field.catalogCategory]: item.categoryName,
    [copy.field.customerCode]: item.customerCode,
    [copy.field.listPrice]: formatMoney(item.priceCents),
    [copy.field.status]: item.enabled ? copy.statusValue.orderable : copy.statusValue.discontinued,
  }
}

interface ExistingItem {
  id: number
  productId: number
  categoryId: number
  customerCode: string
  priceCents: number
  enabled: boolean
  version: number
}

function sameItem(row: ExistingItem, input: CatalogItemSave): boolean {
  return (
    row.categoryId === Number(input.categoryId) &&
    row.customerCode === input.customerCode &&
    row.priceCents === input.priceCents &&
    row.enabled === input.enabled
  )
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly products: ProductService,
  ) {}

  get(customerId: number): Promise<Catalog> {
    return catalogOf(this.db, customerId)
  }

  // 新加或修改一个目录项；停用的产品不能新加进目录（已在目录里的可以改成停订）
  saveItem(
    viewer: Viewer,
    customerId: number,
    productId: number,
    input: CatalogItemSave,
  ): Promise<Catalog> {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.saveItemIn(ctx, customerId, productId, input)),
      CODE_FIELDS,
    )
  }

  private async saveItemIn(
    ctx: WriteContext,
    customerId: number,
    productId: number,
    input: CatalogItemSave,
  ): Promise<Catalog> {
    const latest = await catalogOf(ctx.tx, customerId)
    const stale = () => Promise.reject(appError.stale(copy.catalog.catalogStale, latest))
    const row = await this.lockItem(ctx, customerId, productId)
    if (row?.version !== input.version) return stale()
    const category = latest.categories.find((c) => c.id === input.categoryId)
    if (!category) throw appError.validation({ categoryId: copy.catalog.catalogCategoryRequired })
    const name = await this.productName(ctx, productId, row === undefined)
    const bomChanged = input.product
      ? await this.products.replaceBomIn(ctx, productId, input.product, stale)
      : false
    const itemChanged = row === undefined || !sameItem(row, input)
    if (!itemChanged && !bomChanged) throw appError.businessRule(copy.error.noChange)
    if (itemChanged) {
      await this.writeItem(ctx, { customerId, productId, name, category, input, row, latest })
    }
    ctx.notify([{ topic: `catalog:${customerId}`, version: null }])
    return catalogOf(ctx.tx, customerId)
  }

  // 行锁这个客户的目录（和门店下单、改单的共享锁互斥）；返回这一项（新加的为 undefined）
  private async lockItem(ctx: WriteContext, customerId: number, productId: number) {
    const rows: ExistingItem[] = await ctx.tx
      .select({
        id: catalogItems.id,
        productId: catalogItems.productId,
        categoryId: catalogItems.categoryId,
        customerCode: catalogItems.customerCode,
        priceCents: catalogItems.priceCents,
        enabled: catalogItems.enabled,
        version: catalogItems.version,
      })
      .from(catalogItems)
      .where(eq(catalogItems.customerId, customerId))
      .orderBy(asc(catalogItems.id))
      .for('update')
    return rows.find((r) => r.productId === productId)
  }

  // 产品须存在；新加进目录的还须启用
  private async productName(ctx: WriteContext, productId: number, adding: boolean) {
    const [row] = await ctx.tx
      .select({ name: products.name, enabled: products.enabled })
      .from(products)
      .where(eq(products.id, productId))
    const product = found(row)
    if (adding && !product.enabled) {
      throw appError.businessRule(copy.catalog.productDisabledForCatalog(product.name))
    }
    return product.name
  }

  private async writeItem(
    ctx: WriteContext,
    w: {
      customerId: number
      productId: number
      name: string
      category: CatalogCategory
      input: CatalogItemSave
      row: ExistingItem | undefined
      latest: Catalog
    },
  ): Promise<void> {
    const { customerId, productId, input, row } = w
    const values = await this.upsertItem(ctx, w)
    const synced =
      row && row.priceCents !== input.priceCents
        ? await this.syncPending(ctx, customerId, productId, input.priceCents)
        : []
    const nos = synced.map((order) => order.no).join(copy.order.nameSeparator)
    const beforeName = w.latest.categories.find((c) => c.id === String(row?.categoryId))?.name
    await ctx.log({
      module: 'sales',
      kind: copy.log.kind.catalog,
      action: copy.log.action.updateCatalog,
      targetType: 'customers',
      targetId: customerId,
      targetLabel: `${w.latest.customerName}${copy.separator}${w.name}`,
      reason: synced.length === 0 ? '' : copy.order.syncedByCatalog(nos),
      before: row ? itemView({ ...row, categoryName: beforeName ?? '' }) : {},
      after: itemView({ ...values, categoryName: w.category.name }),
    })
    if (synced.length === 0) return
    ctx.notify(
      [
        ...synced.map((order) => ({ topic: `order:${order.id}` as const, version: order.version })),
        { topic: 'orders' as const, version: null },
      ],
      { storeIds: synced.map((order) => String(order.storeId)) },
    )
  }

  // 已有的改，新的加进目录；返回写进去的值（日志用）
  private async upsertItem(
    ctx: WriteContext,
    w: {
      customerId: number
      productId: number
      input: CatalogItemSave
      row: ExistingItem | undefined
    },
  ) {
    const { customerId, productId, input, row } = w
    const values = {
      categoryId: Number(input.categoryId),
      customerCode: input.customerCode,
      priceCents: input.priceCents,
      enabled: input.enabled,
    }
    if (row) {
      await ctx.tx
        .update(catalogItems)
        .set({ ...values, version: sql`${catalogItems.version} + 1` })
        .where(eq(catalogItems.id, row.id))
    } else {
      const createdBy = ctx.viewer?.accountId ?? 0
      await ctx.tx.insert(catalogItems).values({ ...values, customerId, productId, createdBy })
    }
    return values
  }

  // 按 id 升序行锁这个客户含这种产品的待确认订单，单价和目录价快照改成新价
  private async syncPending(
    ctx: WriteContext,
    customerId: number,
    productId: number,
    priceCents: number,
  ) {
    const pending = await ctx.tx
      .selectDistinct({ id: orders.id })
      .from(orders)
      .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(orders.status, 'pending_confirm'),
          eq(orderLines.productId, productId),
        ),
      )
    if (pending.length === 0) return []
    // 加锁后按状态复查：查询和加锁之间被确认、取消的不再同步
    const locked = await ctx.tx
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          inArray(
            orders.id,
            pending.map((order) => order.id),
          ),
          eq(orders.status, 'pending_confirm'),
        ),
      )
      .orderBy(asc(orders.id))
      .for('update')
    const ids = locked.map((order) => order.id)
    if (ids.length === 0) return []
    await ctx.tx
      .update(orderLines)
      .set({ priceCents, listPriceCents: priceCents })
      .where(and(inArray(orderLines.orderId, ids), eq(orderLines.productId, productId)))
    return ctx.tx
      .update(orders)
      .set({ version: sql`${orders.version} + 1` })
      .where(inArray(orders.id, ids))
      .returning({ id: orders.id, no: orders.no, storeId: orders.storeId, version: orders.version })
      .then((rows) => rows.sort((a, b) => a.id - b.id))
  }
}
