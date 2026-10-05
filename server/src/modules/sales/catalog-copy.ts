// 从其他客户复制产品（05 章第 4 节）：勾选来源客户的产品复制进当前客户，带名称、单位、产品图、配方、订货价，
// 不带客户产品编码；复制后各管各的。和当前客户重名、已停用的不能复制。
// 同名订货分类复用，没有同名的放当前客户第一个分类，当前客户没有分类时按来源分类名新建
import {
  appError,
  contract,
  copy,
  type Catalog,
  type CatalogCopySource,
  type CatalogItem,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, exists, ne } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  catalogCategories,
  customers,
  productBomLines,
  products,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { snapshotToken } from '../../common/domain/token.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { lockCustomer } from '../../common/org.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { CATALOG_UNIQUE_FIELDS } from './catalog.ts'
import { CatalogReader } from './catalog-read.ts'
import type { Executor } from './order-rows.ts'

type SkipReason = CatalogCopySource['items'][number]['skipReason']

function skipReasonOf(item: CatalogItem, target: Catalog): SkipReason {
  if (target.items.some((row) => row.name === item.name)) return 'duplicate'
  return item.enabled ? null : 'disabled'
}

// 勾选的来源产品：须在预览里，且不是重名、停用的
function pickedOf(
  snap: { view: CatalogCopySource; source: CatalogItem[] },
  productIds: string[],
): CatalogItem[] {
  return [...new Set(productIds)].map((id) => {
    const item = snap.view.items.find((row) => row.productId === id)
    if (!item) throw appError.notFound()
    if (item.skipReason !== null) throw appError.businessRule(copy.rework.catalogCopySkipped)
    return found(snap.source.find((row) => row.productId === id))
  })
}

@Injectable()
export class CatalogCopyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly reader: CatalogReader,
  ) {}

  // 来源客户、来源产品和当前目录；previewToken 覆盖这三样
  private async snapshot(executor: Executor, customerId: number, fromId: number | null) {
    const target = await this.reader.of(executor, customerId)
    if (fromId === customerId) throw appError.businessRule(copy.rework.catalogCopySame)
    const hasProducts = exists(
      executor
        .select({ id: products.id })
        .from(products)
        .where(eq(products.customerId, customers.id)),
    )
    const list = await executor
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(ne(customers.id, customerId), hasProducts))
      .orderBy(asc(customers.id))
    if (fromId !== null) {
      const [from] = await executor
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, fromId))
      found(from)
    }
    const sourceId = fromId ?? list[0]?.id ?? null
    const source = sourceId === null ? [] : await this.reader.items(executor, sourceId)
    const items = source.map((item) => ({
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      categoryName: item.categoryName,
      listPriceCents: item.listPriceCents,
      bom: item.bom,
      skipReason: skipReasonOf(item, target),
    }))
    const view: CatalogCopySource = {
      sources: list.map((row) => ({ customerId: String(row.id), customerName: row.name })),
      fromCustomerId: sourceId === null ? null : String(sourceId),
      items,
      previewToken: snapshotToken({ source, target: target.items }),
    }
    return { view, source, target }
  }

  sources(customerId: number, fromId: number | null): Promise<CatalogCopySource> {
    return this.db.transaction(async (tx) => (await this.snapshot(tx, customerId, fromId)).view, {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }

  copy(
    viewer: Viewer,
    customerId: number,
    input: { fromCustomerId: string; productIds: string[]; previewToken: string },
    key: string,
  ): Promise<Catalog> {
    return guardUnique(
      () =>
        this.writes.run(viewer, (ctx) => this.copyIn(ctx, viewer, customerId, input), {
          endpoint: contract.copyCatalog,
          key,
        }),
      CATALOG_UNIQUE_FIELDS,
    )
  }

  private async copyIn(
    ctx: WriteContext,
    viewer: Viewer,
    customerId: number,
    input: { fromCustomerId: string; productIds: string[]; previewToken: string },
  ): Promise<Catalog> {
    const sourceId = Number(input.fromCustomerId)
    if (sourceId === customerId) throw appError.businessRule(copy.rework.catalogCopySame)
    for (const id of [customerId, sourceId].sort((a, b) => a - b)) await lockCustomer(ctx.tx, id)
    const snap = await this.snapshot(ctx.tx, customerId, sourceId)
    if (snap.view.previewToken !== input.previewToken)
      throw appError.stale(copy.rework.catalogCopyStale, snap.view)
    const picked = pickedOf(snap, input.productIds)
    const categoryOf = this.categoryMapper(ctx, viewer, customerId, snap.target)
    for (const item of picked)
      await this.insertCopy(ctx, viewer, item, {
        customerId,
        categoryId: await categoryOf(item.categoryName),
      })
    const [source] = await ctx.tx
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, sourceId))
    await ctx.log({
      module: 'sales',
      kind: copy.log.kind.catalog,
      action: copy.log.action.copyCatalog,
      targetType: 'customers',
      targetId: customerId,
      targetLabel: snap.target.customerName,
      after: {
        来源: found(source).name,
        产品: picked.map((item) => item.name).join(copy.order.nameSeparator),
      },
    })
    ctx.notify([{ topic: `catalog:${customerId}`, version: null }])
    return this.reader.of(ctx.tx, customerId)
  }

  // 复制一个产品和它的配方：编码清空、可订
  private async insertCopy(
    ctx: WriteContext,
    viewer: Viewer,
    item: CatalogItem,
    target: { customerId: number; categoryId: number },
  ): Promise<void> {
    const [row] = await ctx.tx
      .insert(products)
      .values({
        customerId: target.customerId,
        name: item.name,
        unit: item.unit,
        imageFileId: item.imageFileId === null ? null : Number(item.imageFileId),
        categoryId: target.categoryId,
        customerCode: '',
        priceCents: item.listPriceCents,
        enabled: true,
        createdBy: viewer.accountId,
      })
      .returning({ id: products.id })
    const productId = found(row).id
    await ctx.tx.insert(productBomLines).values(
      item.bom.map((line) => ({
        productId,
        materialId: Number(line.materialId),
        qty: line.qty,
        createdBy: viewer.accountId,
      })),
    )
  }

  // 来源分类名 → 当前客户的分类 id
  private categoryMapper(ctx: WriteContext, viewer: Viewer, customerId: number, target: Catalog) {
    const byName = new Map(target.categories.map((row) => [row.name, Number(row.id)]))
    const first = target.categories[0]
    let sort = Math.max(0, ...target.categories.map((row) => row.sort))
    return async (name: string): Promise<number> => {
      const same = byName.get(name)
      if (same !== undefined) return same
      if (first) return Number(first.id)
      const [row] = await ctx.tx
        .insert(catalogCategories)
        .values({ customerId, name, sort: ++sort, createdBy: viewer.accountId })
        .returning({ id: catalogCategories.id })
      byName.set(name, found(row).id)
      return found(row).id
    }
  }
}
