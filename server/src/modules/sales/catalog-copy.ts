import type { Catalog } from '@huazhong/shared'
import { catalogCategories, catalogItems } from '../../../db/schema/index.ts'
import { found } from '../../common/scope.ts'
import type { WriteContext } from '../../common/write.service.ts'
interface CopyData {
  customerId: number
  accountId: number
  source: Catalog
  target: Catalog
  items: Catalog['items']
}
export async function insertCatalogCopy(ctx: WriteContext, data: CopyData) {
  const { customerId, accountId } = data
  const snapshot = data
  const categories = new Map(snapshot.target.categories.map((row) => [row.name, Number(row.id)]))
  let sort = Math.max(0, ...snapshot.target.categories.map((row) => row.sort))
  for (const category of snapshot.source.categories) {
    if (
      !snapshot.items.some((item) => item.categoryId === category.id) ||
      categories.has(category.name)
    )
      continue
    const row = found(
      (
        await ctx.tx
          .insert(catalogCategories)
          .values({
            customerId,
            name: category.name,
            sort: ++sort,
            createdBy: accountId,
          })
          .returning()
      )[0],
    )
    categories.set(category.name, row.id)
  }
  await ctx.tx.insert(catalogItems).values(
    snapshot.items.map((item) => ({
      customerId,
      productId: Number(item.productId),
      categoryId: found(categories.get(item.categoryName)),
      customerCode: '',
      priceCents: item.listPriceCents,
      enabled: true,
      createdBy: accountId,
    })),
  )
}
