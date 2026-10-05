// 读一个客户的订货目录（05 章第 4 节）：订货分类 + 这个客户自己的产品（含配方、产品图地址）。
// 目录、订货分类、复制的写接口都返回整份目录
import type { Catalog, CatalogCategory, CatalogItem } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { catalogCategories, customers, products } from '../../../db/schema/index.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { found } from '../../common/scope.ts'
import { FilesService } from '../files/files.service.ts'
import { bomLinesOf } from './bom.ts'
import type { Executor } from './order-rows.ts'

export async function catalogCategoriesOf(
  executor: Executor,
  customerId: number,
): Promise<CatalogCategory[]> {
  const itemCount = executor
    .select({ total: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.categoryId, catalogCategories.id))
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

@Injectable()
export class CatalogReader {
  constructor(private readonly files: FilesService) {}

  // 分类按 sort，产品按分类、再按新建顺序
  async items(executor: Executor, customerId: number): Promise<CatalogItem[]> {
    const rows = await executor
      .select({
        productId: products.id,
        version: products.version,
        name: products.name,
        unit: products.unit,
        imageFileId: products.imageFileId,
        categoryId: products.categoryId,
        categoryName: catalogCategories.name,
        customerCode: products.customerCode,
        enabled: products.enabled,
        listPriceCents: products.priceCents,
      })
      .from(products)
      .innerJoin(catalogCategories, eq(catalogCategories.id, products.categoryId))
      .where(eq(products.customerId, customerId))
      .orderBy(asc(catalogCategories.sort), asc(catalogCategories.id), asc(products.id))
    const bom = await bomLinesOf(
      executor,
      rows.map((row) => row.productId),
    )
    const urls = await this.files.urlsOf(
      executor,
      rows.flatMap((row) => (row.imageFileId === null ? [] : [row.imageFileId])),
    )
    return rows.map((row) => ({
      ...row,
      productId: String(row.productId),
      categoryId: String(row.categoryId),
      imageFileId: row.imageFileId === null ? null : String(row.imageFileId),
      imageUrl: row.imageFileId === null ? null : (urls.get(row.imageFileId)?.url ?? null),
      bom: bom.get(row.productId) ?? [],
    }))
  }

  // 有其他客户的产品时可以「从其他客户复制」
  async of(executor: Executor, customerId: number): Promise<Catalog> {
    const [customer] = await executor
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
    const categories = await catalogCategoriesOf(executor, customerId)
    const items = await this.items(executor, customerId)
    const [other] = await executor
      .select({ id: products.id })
      .from(products)
      .where(and(ne(products.customerId, customerId), eq(products.enabled, true)))
      .limit(1)
    return {
      customerId: String(customerId),
      customerName: found(customer).name,
      categories,
      items,
      actions: other ? [enabledAction('copyCatalog', false)] : [],
    }
  }
}
