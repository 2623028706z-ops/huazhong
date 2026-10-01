// 订货目录（05 章第 4 节）：每个客户一份价目。改了目录价，同一事务把这个客户待确认订单里这种产品的
// 单价、目录价快照改成新价（订单 version +1），只记在「修改订货目录」日志里，不写变更记录（阶段 3 确认）
import { appError, copy, formatMoney, type Catalog, type CatalogSave } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  catalogItems,
  customers,
  orderLines,
  orders,
  productCategories,
  products,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import type { Executor } from './order-rows.ts'

type SaveItem = CatalogSave['items'][number]

interface ExistingItem {
  id: number
  productId: number
  priceCents: number
  enabled: boolean
  version: number
}

function itemView(priceCents: number, enabled: boolean): string {
  const status = enabled ? copy.statusValue.orderable : copy.statusValue.discontinued
  return `${formatMoney(priceCents)}${copy.separator}${status}`
}

async function catalogOf(executor: Executor, customerId: number): Promise<Catalog> {
  const [customer] = await executor
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
  const rows = await executor
    .select({
      productId: catalogItems.productId,
      name: products.name,
      unit: products.unit,
      categoryName: productCategories.name,
      productEnabled: products.enabled,
      enabled: catalogItems.enabled,
      listPriceCents: catalogItems.priceCents,
      version: catalogItems.version,
    })
    .from(catalogItems)
    .innerJoin(products, eq(products.id, catalogItems.productId))
    .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(eq(catalogItems.customerId, customerId))
    .orderBy(asc(productCategories.sort), asc(productCategories.id), asc(products.id))
  return {
    customerId: String(customerId),
    customerName: found(customer).name,
    items: rows.map((row) => ({ ...row, productId: String(row.productId) })),
  }
}

function isChanged(item: SaveItem, existing: ExistingItem | undefined): boolean {
  return !existing || existing.priceCents !== item.priceCents || existing.enabled !== item.enabled
}

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
  ) {}

  get(customerId: number): Promise<Catalog> {
    return catalogOf(this.db, customerId)
  }

  // 只改传了的项；停用的产品不能新加进目录（已在目录里的可以改成停订）
  save(viewer: Viewer, customerId: number, input: CatalogSave): Promise<Catalog> {
    return this.writes.run(viewer, async (ctx) => {
      const latest = await catalogOf(ctx.tx, customerId)
      const byProduct = await this.lockItems(ctx, customerId, latest, input)
      const changed = input.items.filter((item) =>
        isChanged(item, byProduct.get(Number(item.productId))),
      )
      if (changed.length === 0) throw appError.businessRule(copy.error.noChange)
      const views = await this.writeItems(ctx, customerId, changed, byProduct)
      const repriced = changed.filter((item) => {
        const row = byProduct.get(Number(item.productId))
        return row !== undefined && row.priceCents !== item.priceCents
      })
      const synced = await this.syncPending(ctx, customerId, repriced)
      const nos = synced.map((order) => order.no).join(copy.order.nameSeparator)
      await ctx.log({
        module: 'sales',
        kind: copy.log.kind.catalog,
        action: copy.log.action.updateCatalog,
        targetType: 'customers',
        targetId: customerId,
        targetLabel: latest.customerName,
        reason: synced.length === 0 ? '' : copy.order.syncedByCatalog(nos),
        ...views,
      })
      ctx.notify(
        [
          { topic: `catalog:${customerId}`, version: null },
          ...synced.map((order) => ({
            topic: `order:${order.id}` as const,
            version: order.version,
          })),
          ...(synced.length > 0 ? [{ topic: 'orders' as const, version: null }] : []),
        ],
        { storeIds: synced.map((order) => String(order.storeId)) },
      )
      return catalogOf(ctx.tx, customerId)
    })
  }

  // 行锁这个客户的目录（和门店下单、改单的共享锁互斥），逐项核对版本号
  private async lockItems(
    ctx: WriteContext,
    customerId: number,
    latest: Catalog,
    input: CatalogSave,
  ): Promise<Map<number, ExistingItem>> {
    const existing: ExistingItem[] = await ctx.tx
      .select({
        id: catalogItems.id,
        productId: catalogItems.productId,
        priceCents: catalogItems.priceCents,
        enabled: catalogItems.enabled,
        version: catalogItems.version,
      })
      .from(catalogItems)
      .where(eq(catalogItems.customerId, customerId))
      .orderBy(asc(catalogItems.id))
      .for('update')
    const byProduct = new Map(existing.map((row) => [row.productId, row]))
    for (const item of input.items) {
      const row = byProduct.get(Number(item.productId))
      if (row && row.version !== item.version) {
        throw appError.stale(copy.catalog.catalogStale, latest)
      }
    }
    return byProduct
  }

  // 已有的改价、改停订，新的加进目录；返回日志的修改前后
  private async writeItems(
    ctx: WriteContext,
    customerId: number,
    changed: readonly SaveItem[],
    byProduct: ReadonlyMap<number, ExistingItem>,
  ) {
    const names = await this.productNames(ctx, changed, byProduct)
    const before: Record<string, string> = {}
    const after: Record<string, string> = {}
    for (const item of changed) {
      const productId = Number(item.productId)
      const row = byProduct.get(productId)
      const name = names.get(productId) ?? ''
      if (row) {
        before[name] = itemView(row.priceCents, row.enabled)
        await ctx.tx
          .update(catalogItems)
          .set({
            priceCents: item.priceCents,
            enabled: item.enabled,
            version: sql`${catalogItems.version} + 1`,
          })
          .where(eq(catalogItems.id, row.id))
      } else {
        await ctx.tx.insert(catalogItems).values({
          customerId,
          productId,
          priceCents: item.priceCents,
          enabled: item.enabled,
          createdBy: ctx.viewer?.accountId ?? 0,
        })
      }
      after[name] = itemView(item.priceCents, item.enabled)
    }
    return { before, after }
  }

  // 新加进目录的产品须存在且启用；返回改到的产品名
  private async productNames(
    ctx: WriteContext,
    changed: readonly SaveItem[],
    byProduct: ReadonlyMap<number, ExistingItem>,
  ): Promise<Map<number, string>> {
    const ids = changed.map((item) => Number(item.productId))
    const rows = await ctx.tx
      .select({ id: products.id, name: products.name, enabled: products.enabled })
      .from(products)
      .where(inArray(products.id, ids))
    for (const id of ids) {
      const row = rows.find((r) => r.id === id)
      if (!row) throw appError.notFound()
      if (!byProduct.has(id) && !row.enabled) {
        throw appError.businessRule(copy.catalog.productDisabledForCatalog(row.name))
      }
    }
    return new Map(rows.map((row) => [row.id, row.name]))
  }

  // 按 id 升序行锁这个客户含这些产品的待确认订单，单价和目录价快照改成新价
  private async syncPending(ctx: WriteContext, customerId: number, repriced: readonly SaveItem[]) {
    if (repriced.length === 0) return []
    const ids = repriced.map((item) => Number(item.productId))
    const pending = await ctx.tx
      .selectDistinct({ id: orders.id, no: orders.no, storeId: orders.storeId })
      .from(orders)
      .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(orders.status, 'pending_confirm'),
          inArray(orderLines.productId, ids),
        ),
      )
      .orderBy(asc(orders.id))
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
    const orderIds = locked.map((order) => order.id)
    if (orderIds.length === 0) return []
    for (const item of repriced) {
      await ctx.tx
        .update(orderLines)
        .set({ priceCents: item.priceCents, listPriceCents: item.priceCents })
        .where(
          and(
            inArray(orderLines.orderId, orderIds),
            eq(orderLines.productId, Number(item.productId)),
          ),
        )
    }
    return ctx.tx
      .update(orders)
      .set({ version: sql`${orders.version} + 1` })
      .where(inArray(orders.id, orderIds))
      .returning({ id: orders.id, no: orders.no, storeId: orders.storeId, version: orders.version })
      .then((rows) => rows.sort((a, b) => a.id - b.id))
  }
}
