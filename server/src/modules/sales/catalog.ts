// 订货目录（05 章第 4 节）：产品归客户（2026-10-05 确认），名称、单位、产品图、配方、订货价、订货分类、
// 客户产品编码、可订一起在这个客户的目录里新建、修改，改了只影响这个客户。
// 改了订货价，同一事务把这个客户待确认订单里这种产品的单价、目录价快照改成新价（订单 version +1），
// 只记在日志里，不写变更记录（阶段 3 确认）
import {
  appError,
  contract,
  copy,
  formatMoney,
  formatQty,
  type Catalog,
  type CatalogItem,
  type CatalogItemCreate,
  type CatalogItemUpdate,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  materials,
  orderLines,
  orders,
  productBomLines,
  products,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { lockCustomer } from '../../common/org.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { FilesService } from '../files/files.service.ts'
import { CatalogReader } from './catalog-read.ts'

export const CATALOG_UNIQUE_FIELDS = {
  products_customer_name_unique: { name: copy.catalog.productNameTaken },
  products_customer_code_unique: { customerCode: copy.catalog.customerCodeTaken },
}

type ItemInput = CatalogItemCreate & { version?: number }

// 日志里一个产品的样子
function itemView(item: {
  name: string
  unit: string
  categoryName: string
  customerCode: string
  priceCents: number
  enabled: boolean
  bom: readonly { materialName: string; unit: string; qty: number }[]
}): Record<string, string> {
  return {
    [copy.field.objectName]: item.name,
    [copy.field.unit]: item.unit,
    [copy.field.catalogCategory]: item.categoryName,
    [copy.field.customerCode]: item.customerCode,
    [copy.field.listPrice]: formatMoney(item.priceCents),
    [copy.field.bom]: item.bom
      .map((line) => `${line.materialName} ${formatQty(line.qty, line.unit)}`)
      .join(copy.order.nameSeparator),
    [copy.field.status]: item.enabled ? copy.statusValue.orderable : copy.statusValue.discontinued,
  }
}

const bomKey = (lines: readonly { materialId: string; qty: number }[]) =>
  JSON.stringify(lines.map((line) => [line.materialId, line.qty]))

function sameItem(item: CatalogItem, input: ItemInput): boolean {
  return (
    item.name === input.name &&
    item.unit === input.unit &&
    item.imageFileId === input.imageFileId &&
    item.categoryId === input.categoryId &&
    item.customerCode === input.customerCode &&
    item.listPriceCents === input.priceCents &&
    item.enabled === input.enabled &&
    bomKey(item.bom) === bomKey(input.bom)
  )
}

// 要改的产品须在这个客户的最新目录里、版本没变；新建时为 null
function beforeOf(latest: Catalog, productId: number | null, version?: number): CatalogItem | null {
  if (productId === null) return null
  const before = latest.items.find((item) => item.productId === String(productId))
  if (!before) throw appError.notFound()
  if (before.version !== version) throw appError.stale(copy.catalog.catalogStale, latest)
  return before
}

// 分类须是这个客户的；名称、编码同客户不重复；改的时候须有变化
function checkInput(latest: Catalog, before: CatalogItem | null, input: ItemInput): void {
  if (!latest.categories.some((c) => c.id === input.categoryId))
    throw appError.validation({ categoryId: copy.catalog.catalogCategoryRequired })
  const others = latest.items.filter((item) => item.productId !== before?.productId)
  if (others.some((item) => item.name === input.name))
    throw appError.validation({ name: copy.catalog.productNameTaken })
  const code = input.customerCode
  if (code !== '' && others.some((item) => item.customerCode === code))
    throw appError.validation({ customerCode: copy.catalog.customerCodeTaken })
  if (before && sameItem(before, input)) throw appError.businessRule(copy.error.noChange)
}

type Synced = { id: number; no: string; storeId: number; version: number }[]

@Injectable()
export class CatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly reader: CatalogReader,
    private readonly files: FilesService,
  ) {}

  get(customerId: number): Promise<Catalog> {
    return this.reader.of(this.db, customerId)
  }

  create(
    viewer: Viewer,
    customerId: number,
    input: CatalogItemCreate,
    key: string,
  ): Promise<Catalog> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          (ctx) => this.save(ctx, viewer, { customerId, productId: null }, input),
          {
            endpoint: contract.createCatalogItem,
            key,
          },
        ),
      CATALOG_UNIQUE_FIELDS,
    )
  }

  update(
    viewer: Viewer,
    customerId: number,
    productId: number,
    input: CatalogItemUpdate,
  ): Promise<Catalog> {
    return guardUnique(
      () =>
        this.writes.run(viewer, (ctx) => this.save(ctx, viewer, { customerId, productId }, input)),
      CATALOG_UNIQUE_FIELDS,
    )
  }

  // 先锁客户、再锁这个客户的全部产品（和门店下单、改单的共享锁互斥），再按最新目录核对
  private async save(
    ctx: WriteContext,
    viewer: Viewer,
    target: { customerId: number; productId: number | null },
    input: ItemInput,
  ): Promise<Catalog> {
    const { customerId } = target
    await lockCustomer(ctx.tx, customerId)
    await ctx.tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.customerId, customerId))
      .orderBy(asc(products.id))
      .for('update')
    const latest = await this.reader.of(ctx.tx, customerId)
    const before = beforeOf(latest, target.productId, input.version)
    checkInput(latest, before, input)
    await this.assertRefs(ctx, viewer, input, before)
    const id = await this.writeRow(ctx, viewer, input, { customerId, before })
    const bomChanged = !before || bomKey(before.bom) !== bomKey(input.bom)
    if (bomChanged) await this.replaceBom(ctx, viewer, id, input)
    const synced =
      before && before.listPriceCents !== input.priceCents
        ? await this.syncPending(ctx, customerId, id, input.priceCents)
        : []
    const next = await this.reader.of(ctx.tx, customerId)
    const after = found(next.items.find((item) => item.productId === String(id)))
    await this.announce(ctx, { customerId, latest, before, after }, { synced, bomChanged })
    return next
  }

  // 记日志、推送：目录；改了配方推采购需求；同步了待确认订单推这些订单
  private async announce(
    ctx: WriteContext,
    items: { customerId: number; latest: Catalog; before: CatalogItem | null; after: CatalogItem },
    effects: { synced: Synced; bomChanged: boolean },
  ): Promise<void> {
    const { customerId, before, after } = items
    const { synced, bomChanged } = effects
    const view = (item: CatalogItem) => itemView({ ...item, priceCents: item.listPriceCents })
    const nos = synced.map((order) => order.no).join(copy.order.nameSeparator)
    await ctx.log({
      module: 'sales',
      kind: copy.log.kind.catalog,
      action: before ? copy.log.action.updateProduct : copy.log.action.createProduct,
      targetType: 'products',
      targetId: Number(after.productId),
      targetLabel: `${items.latest.customerName}${copy.separator}${after.name}`,
      reason: synced.length === 0 ? '' : copy.order.syncedByCatalog(nos),
      before: before ? view(before) : {},
      after: view(after),
    })
    ctx.notify([
      { topic: `catalog:${customerId}`, version: null },
      ...(bomChanged ? [{ topic: 'demand' as const, version: null }] : []),
    ])
    if (synced.length > 0)
      ctx.notify(
        [
          ...synced.map((order) => ({
            topic: `order:${order.id}` as const,
            version: order.version,
          })),
          { topic: 'orders' as const, version: null },
        ],
        { storeIds: synced.map((order) => String(order.storeId)) },
      )
  }

  // 配方花材都存在，不在原配方里的还须启用；换了产品图须已上传通过
  private async assertRefs(
    ctx: WriteContext,
    viewer: Viewer,
    input: ItemInput,
    before: CatalogItem | null,
  ): Promise<void> {
    const ids = input.bom.map((line) => Number(line.materialId))
    const rows = await ctx.tx
      .select({ id: materials.id, enabled: materials.enabled })
      .from(materials)
      .where(inArray(materials.id, ids))
    const kept = new Set(before?.bom.map((line) => Number(line.materialId)) ?? [])
    const usable = ids.every((id) => {
      const row = rows.find((r) => r.id === id)
      return row !== undefined && (row.enabled || kept.has(id))
    })
    if (!usable) throw appError.validation({ bom: copy.catalog.bomMaterialUnavailable })
    const imageId = input.imageFileId
    if (imageId !== null && imageId !== before?.imageFileId)
      await this.files.assertUsable(ctx.tx, viewer, 'product_image', [Number(imageId)])
  }

  private async writeRow(
    ctx: WriteContext,
    viewer: Viewer,
    input: ItemInput,
    target: { customerId: number; before: CatalogItem | null },
  ): Promise<number> {
    const { customerId, before } = target
    const values = {
      name: input.name,
      unit: input.unit,
      imageFileId: input.imageFileId === null ? null : Number(input.imageFileId),
      categoryId: Number(input.categoryId),
      customerCode: input.customerCode,
      priceCents: input.priceCents,
      enabled: input.enabled,
    }
    if (before) {
      const id = Number(before.productId)
      await ctx.tx
        .update(products)
        .set({ ...values, version: sql`${products.version} + 1` })
        .where(eq(products.id, id))
      return id
    }
    const [row] = await ctx.tx
      .insert(products)
      .values({ ...values, customerId, createdBy: viewer.accountId })
      .returning({ id: products.id })
    return found(row).id
  }

  private async replaceBom(ctx: WriteContext, viewer: Viewer, productId: number, input: ItemInput) {
    await ctx.tx.delete(productBomLines).where(eq(productBomLines.productId, productId))
    await ctx.tx.insert(productBomLines).values(
      input.bom.map((line) => ({
        productId,
        materialId: Number(line.materialId),
        qty: line.qty,
        createdBy: viewer.accountId,
      })),
    )
  }

  // 按 id 升序行锁这个客户含这种产品的待确认订单，单价和目录价快照改成新价
  private async syncPending(
    ctx: WriteContext,
    customerId: number,
    productId: number,
    priceCents: number,
  ): Promise<Synced> {
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
