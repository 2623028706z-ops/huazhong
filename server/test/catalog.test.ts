// 订货目录（05 章第 4 节，2026-10-03 确认）：每个客户一套订货分类、客户产品编码、目录弹层一起改配方
import type { Catalog, CatalogItem, OrderDetail, ProductItem, StoreCatalog } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { materials } from '../db/schema/index.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const catalogOf = async (customer: string) => {
  const id = await idBy(s.t, 'customers.name', customer)
  return { id, catalog: dataOf<Catalog>(await (await s.as('u2')).get(`/catalog/${id}`)) }
}

const itemOf = (catalog: Catalog, name: string): CatalogItem => {
  const item = catalog.items.find((i) => i.name === name)
  if (!item) throw new Error(`no catalog item ${name}`)
  return item
}

const bodyOf = (item: CatalogItem, change: Record<string, unknown> = {}) => ({
  version: item.version,
  categoryId: item.categoryId,
  customerCode: item.customerCode,
  priceCents: item.listPriceCents,
  enabled: item.enabled,
  ...change,
})

describe('订货分类', () => {
  test('每个客户一套：新增排最后、同客户不重名、有目录项不能删、排序不全 → STALE', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    expect(catalog.categories.map((c) => c.name)).toEqual(['日常花束', '礼赠花束', '桌面花艺'])
    const other = await catalogOf('一间花房')
    expect(other.catalog.categories.map((c) => c.name)).toEqual(['礼赠花束', '桌面花艺'])

    const added = dataOf<Catalog>(await sales.post(`/catalog/${id}/categories`, { name: '节日' }))
    const festival = added.categories.at(-1)
    expect(festival).toMatchObject({ name: '节日', sort: 4, itemCount: 0 })
    const taken = await sales.patch(`/catalog/${id}/categories/${festival?.id}`, {
      name: '日常花束',
    })
    expect(taken.body.error?.fields).toEqual({ name: '已有同名分类' })

    const daily = catalog.categories[0]
    const inUse = await sales.del(`/catalog/${id}/categories/${daily?.id}`)
    expect(inUse.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '分类中仍有目录产品，请先换分类',
    })
    // 别的客户的分类当作不存在
    const foreign = await sales.del(`/catalog/${other.id}/categories/${daily?.id}`)
    expect(foreign.body.error?.code).toBe('NOT_FOUND')

    const ids = added.categories.map((c) => c.id)
    const partial = await sales.put(`/catalog/${id}/category-order`, { ids: ids.slice(1) })
    expect(partial.body.error?.code).toBe('STALE')
    const moved = dataOf<Catalog>(
      await sales.put(`/catalog/${id}/category-order`, { ids: [...ids].reverse() }),
    )
    expect(moved.categories.map((c) => c.name)).toEqual([
      '节日',
      '桌面花艺',
      '礼赠花束',
      '日常花束',
    ])
    dataOf(await sales.del(`/catalog/${id}/categories/${festival?.id}`))
  })
})

describe('目录项', () => {
  test('分类必选且须是这个客户的；编码同客户不重复，不同客户可以重复；没改 → BUSINESS_RULE', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    const rose = itemOf(catalog, '粉玫瑰日常花束')
    const path = `/catalog/${id}/items/${rose.productId}`

    const noCategory = await sales.put(path, bodyOf(rose, { categoryId: '' }))
    expect(noCategory.body.error?.fields).toEqual({ categoryId: '请选择订货分类' })
    const other = await catalogOf('一间花房')
    const foreign = await sales.put(
      path,
      bodyOf(rose, { categoryId: other.catalog.categories[0]?.id }),
    )
    expect(foreign.body.error?.fields).toEqual({ categoryId: '请选择订货分类' })

    const taken = await sales.put(path, bodyOf(rose, { customerCode: 'CX-102' }))
    expect(taken.body.error?.fields).toEqual({ customerCode: '这个客户下已有相同的产品编码' })
    const unchanged = await sales.put(path, bodyOf(rose))
    expect(unchanged.body.error?.code).toBe('BUSINESS_RULE')

    const gift = catalog.categories.find((c) => c.name === '礼赠花束')
    const saved = dataOf<Catalog>(
      await sales.put(path, bodyOf(rose, { customerCode: 'Y-01', categoryId: gift?.id })),
    )
    expect(itemOf(saved, '粉玫瑰日常花束')).toMatchObject({
      customerCode: 'Y-01',
      categoryName: '礼赠花束',
      version: rose.version + 1,
    })
    // 版本号过期
    const stale = await sales.put(path, bodyOf(rose, { customerCode: 'CX-9' }))
    expect(stale.body.error?.code).toBe('STALE')
  })

  test('弹层改配方：产品本身的配方跟着变；产品版本过期 → STALE，目录也不改', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    const rose = itemOf(catalog, '粉玫瑰日常花束')
    const path = `/catalog/${id}/items/${rose.productId}`
    const [material] = await s.t.db.select().from(materials).where(eq(materials.name, '粉雪山玫瑰'))
    const bom = [{ materialId: String(material?.id), qty: 12 }]

    const stale = await sales.put(
      path,
      bodyOf(rose, { priceCents: 7100, product: { version: rose.productVersion + 1, bom } }),
    )
    expect(stale.body.error?.code).toBe('STALE')
    expect(itemOf((await catalogOf('晨曦花艺')).catalog, '粉玫瑰日常花束').listPriceCents).toBe(
      rose.listPriceCents,
    )

    const saved = dataOf<Catalog>(
      await sales.put(path, bodyOf(rose, { product: { version: rose.productVersion, bom } })),
    )
    expect(itemOf(saved, '粉玫瑰日常花束').bom).toEqual([
      expect.objectContaining({ materialName: '粉雪山玫瑰', qty: 12 }),
    ])
    const products = dataOf<{ items: ProductItem[] }>(await sales.get('/products'))
    const product = products.items.find((p) => p.name === '粉玫瑰日常花束')
    expect(product?.bom.map((l) => l.qty)).toEqual([12])
    // 别的客户目录里同一个产品也是新配方
    const other = itemOf((await catalogOf('拾光花店')).catalog, '粉玫瑰日常花束')
    expect(other.bom.map((l) => l.qty)).toEqual([12])
  })

  test('门店订货页按订货分类分组、带编码；下单时编码快照，之后改编码旧单不变', async () => {
    const store = await s.as('s1')
    const shop = dataOf<StoreCatalog>(await store.get('/store/catalog'))
    expect(shop.categories.map((c) => c.name)).toEqual(['日常花束', '桌面花艺'])
    const rose = shop.items.find((i) => i.name === '粉玫瑰日常花束')
    expect(rose?.customerCode).toBe('CX-101')

    const order = dataOf<OrderDetail>(
      await store.post('/store/orders', {
        note: '',
        lines: [{ productId: rose?.productId, qty: 1 }],
      }),
    )
    expect(order.lines[0]?.customerCode).toBe('CX-101')

    const { id, catalog } = await catalogOf('晨曦花艺')
    const item = itemOf(catalog, '粉玫瑰日常花束')
    dataOf(
      await (
        await s.as('u2')
      ).put(`/catalog/${id}/items/${item.productId}`, bodyOf(item, { customerCode: 'CX-999' })),
    )
    const again = dataOf<OrderDetail>(await store.get(`/orders/${order.id}`))
    expect(again.lines[0]?.customerCode).toBe('CX-101')
  })
})
