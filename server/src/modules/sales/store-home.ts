// 门店首页、订货目录（05 章第 5 节）：可订 = 目录启用且产品本身启用；客户停用时门店照常登录，不能下新单
import { appError, copy, type StoreCatalog, type StoreHome } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { catalogItems, customers, productCategories, products } from '../../../db/schema/index.ts'
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
export class StoreHomeService {
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

  async home(viewer: Viewer): Promise<StoreHome> {
    const customerId = customerIdOf(viewer)
    const enabled = await this.customerEnabled(customerId)
    const [row] = await this.db
      .select({ total: count() })
      .from(catalogItems)
      .innerJoin(products, eq(products.id, catalogItems.productId))
      .where(orderable(customerId))
    return {
      customerId: String(customerId),
      orderableCount: row?.total ?? 0,
      lockedReason: enabled ? null : copy.store.customerDisabled,
    }
  }

  // 全部可订产品一次给全（购物车要核对停订）；分类、搜索在页面里筛
  async catalog(viewer: Viewer): Promise<StoreCatalog> {
    const customerId = customerIdOf(viewer)
    if (!(await this.customerEnabled(customerId))) {
      throw appError.businessRule(copy.store.customerDisabled)
    }
    const rows = await this.db
      .select({
        productId: products.id,
        name: products.name,
        unit: products.unit,
        categoryId: productCategories.id,
        categoryName: productCategories.name,
        listPriceCents: catalogItems.priceCents,
        imageFileId: products.imageFileId,
      })
      .from(catalogItems)
      .innerJoin(products, eq(products.id, catalogItems.productId))
      .innerJoin(productCategories, eq(productCategories.id, products.categoryId))
      .where(orderable(customerId))
      .orderBy(asc(productCategories.sort), asc(productCategories.id), asc(products.id))
    const urls = await this.files.urlsOf(
      this.db,
      rows.flatMap((row) => (row.imageFileId === null ? [] : [row.imageFileId])),
    )
    const categories = new Map<number, string>()
    for (const row of rows) categories.set(row.categoryId, row.categoryName)
    return {
      categories: [...categories].map(([id, name]) => ({ id: String(id), name })),
      items: rows.map((row) => ({
        productId: String(row.productId),
        name: row.name,
        unit: row.unit,
        categoryId: String(row.categoryId),
        listPriceCents: row.listPriceCents,
        thumbUrl: row.imageFileId === null ? null : (urls.get(row.imageFileId)?.thumbUrl ?? null),
      })),
    }
  }
}
