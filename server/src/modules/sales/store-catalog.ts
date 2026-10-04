// 门店订货目录（05 章第 5 节）：可订 = 目录启用且产品本身启用；按这个客户的订货分类分组；
// 客户停用时门店照常登录，不能下新单
import { appError, copy, type StoreCatalog } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  catalogCategories,
  catalogItems,
  customers,
  products,
  stores,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { FilesService } from '../files/files.service.ts'

// 门店账号一定有客户（accounts_store_link + stores.customer_id NOT NULL）
function customerIdOf(viewer: Viewer): number {
  if (viewer.customerId === null) throw appError.internal()
  return viewer.customerId
}

const orderable = (customerId: number) =>
  and(
    eq(catalogItems.customerId, customerId),
    eq(catalogItems.enabled, true),
    eq(products.enabled, true),
  )

@Injectable()
export class StoreCatalogService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly files: FilesService,
  ) {}

  private async customerEnabled(customerId: number): Promise<boolean> {
    const [customer] = await this.db
      .select({ enabled: customers.enabled })
      .from(customers)
      .where(eq(customers.id, customerId))
    if (!customer) throw appError.internal()
    return customer.enabled
  }

  // 全部可订产品一次给全（购物车要核对停用）；分类、搜索在页面里筛
  async catalog(viewer: Viewer): Promise<StoreCatalog> {
    const customerId = customerIdOf(viewer)
    const enabled = await this.customerEnabled(customerId)
    const [org] = await this.db
      .select({ customerName: customers.name, storeName: stores.name })
      .from(stores)
      .innerJoin(customers, eq(customers.id, stores.customerId))
      .where(eq(stores.id, viewer.storeId ?? 0))
    if (!org || viewer.storeId === null) throw appError.internal()
    const rows = await this.db
      .select({
        productId: products.id,
        name: products.name,
        unit: products.unit,
        categoryId: catalogCategories.id,
        categoryName: catalogCategories.name,
        customerCode: catalogItems.customerCode,
        listPriceCents: catalogItems.priceCents,
        imageFileId: products.imageFileId,
      })
      .from(catalogItems)
      .innerJoin(products, eq(products.id, catalogItems.productId))
      .innerJoin(catalogCategories, eq(catalogCategories.id, catalogItems.categoryId))
      .where(orderable(customerId))
      .orderBy(asc(catalogCategories.sort), asc(catalogCategories.id), asc(products.id))
    const urls = await this.files.urlsOf(
      this.db,
      rows.flatMap((row) => (row.imageFileId === null ? [] : [row.imageFileId])),
    )
    const categories = new Map<number, string>()
    for (const row of rows) categories.set(row.categoryId, row.categoryName)
    return {
      customerId: String(customerId),
      customerName: org.customerName,
      storeId: String(viewer.storeId),
      storeName: org.storeName,
      lockedReason: enabled ? null : copy.store.customerDisabled,
      categories: [...categories].map(([id, name]) => ({ id: String(id), name })),
      items: rows.map((row) => ({
        productId: String(row.productId),
        name: row.name,
        unit: row.unit,
        categoryId: String(row.categoryId),
        customerCode: row.customerCode,
        listPriceCents: row.listPriceCents,
        thumbUrl: row.imageFileId === null ? null : (urls.get(row.imageFileId)?.thumbUrl ?? null),
      })),
    }
  }
}
