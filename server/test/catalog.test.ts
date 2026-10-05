// 订货目录（05 章第 4 节）：产品归客户，每个客户一套订货分类、产品、配方；发货时存配方；从其他客户复制
import type {
  Catalog,
  CatalogItem,
  contract,
  OrderDetail,
  OutputOf,
  StoreCatalog,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { customers, materials } from '../db/schema/index.ts'
import { found } from '../src/common/scope.ts'
import { catalogItemBody, dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'

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

describe('目录产品', () => {
  test('新建：名称同客户不重复、不同客户可以同名；分类须是这个客户的', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    const [rose] = await s.t.db.select().from(materials).where(eq(materials.name, '粉雪山玫瑰'))
    const body = {
      name: '新品花束',
      unit: '束',
      imageFileId: null,
      categoryId: catalog.categories[0]?.id,
      customerCode: '',
      priceCents: 9900,
      enabled: true,
      bom: [{ materialId: String(rose?.id), qty: 9 }],
    }
    const taken = await sales.post(`/catalog/${id}/items`, { ...body, name: '粉玫瑰日常花束' })
    expect(taken.body.error?.fields).toEqual({ name: '这个客户已有同名产品' })
    const other = await catalogOf('一间花房')
    const foreign = await sales.post(`/catalog/${id}/items`, {
      ...body,
      categoryId: other.catalog.categories[0]?.id,
    })
    expect(foreign.body.error?.fields).toEqual({ categoryId: '请选择订货分类' })

    const created = dataOf<Catalog>(await sales.post(`/catalog/${id}/items`, body))
    expect(itemOf(created, '新品花束')).toMatchObject({
      unit: '束',
      listPriceCents: 9900,
      customerCode: '',
      enabled: true,
      bom: [expect.objectContaining({ materialName: '粉雪山玫瑰', qty: 9 })],
    })
    // 别的客户可以用同一个名字
    const elsewhere = dataOf<Catalog>(
      await sales.post(`/catalog/${other.id}/items`, {
        ...body,
        categoryId: other.catalog.categories[0]?.id,
      }),
    )
    expect(itemOf(elsewhere, '新品花束').productId).not.toBe(itemOf(created, '新品花束').productId)
  })

  test('分类必选且须是这个客户的；编码同客户不重复；没改 → BUSINESS_RULE；版本过期 → STALE', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    const rose = itemOf(catalog, '粉玫瑰日常花束')
    const path = `/catalog/${id}/items/${rose.productId}`

    const noCategory = await sales.patch(path, catalogItemBody(rose, { categoryId: '' }))
    expect(noCategory.body.error?.fields).toEqual({ categoryId: '请选择订货分类' })
    const other = await catalogOf('一间花房')
    const foreign = await sales.patch(
      path,
      catalogItemBody(rose, { categoryId: other.catalog.categories[0]?.id }),
    )
    expect(foreign.body.error?.fields).toEqual({ categoryId: '请选择订货分类' })
    const renamed = await sales.patch(path, catalogItemBody(rose, { name: '白绿清新花束' }))
    expect(renamed.body.error?.fields).toEqual({ name: '这个客户已有同名产品' })

    const taken = await sales.patch(path, catalogItemBody(rose, { customerCode: 'CX-102' }))
    expect(taken.body.error?.fields).toEqual({ customerCode: '这个客户下已有相同的产品编码' })
    const unchanged = await sales.patch(path, catalogItemBody(rose))
    expect(unchanged.body.error?.code).toBe('BUSINESS_RULE')

    const gift = catalog.categories.find((c) => c.name === '礼赠花束')
    const saved = dataOf<Catalog>(
      await sales.patch(
        path,
        catalogItemBody(rose, { customerCode: 'Y-01', categoryId: gift?.id }),
      ),
    )
    expect(itemOf(saved, '粉玫瑰日常花束')).toMatchObject({
      customerCode: 'Y-01',
      categoryName: '礼赠花束',
      version: rose.version + 1,
    })
    const stale = await sales.patch(path, catalogItemBody(rose, { customerCode: 'CX-9' }))
    expect(stale.body.error?.code).toBe('STALE')
  })

  test('改晨曦花艺的配方，拾光花店同名产品的配方不变', async () => {
    const sales = await s.as('u2')
    const { id, catalog } = await catalogOf('晨曦花艺')
    const rose = itemOf(catalog, '粉玫瑰日常花束')
    const [material] = await s.t.db.select().from(materials).where(eq(materials.name, '粉雪山玫瑰'))
    const saved = dataOf<Catalog>(
      await sales.patch(
        `/catalog/${id}/items/${rose.productId}`,
        catalogItemBody(rose, { bom: [{ materialId: String(material?.id), qty: 11 }] }),
      ),
    )
    expect(itemOf(saved, '粉玫瑰日常花束').bom).toEqual([
      expect.objectContaining({ materialName: '粉雪山玫瑰', qty: 11 }),
    ])
    const other = itemOf((await catalogOf('拾光花店')).catalog, '粉玫瑰日常花束')
    expect(other.bom.map((l) => [l.materialName, l.qty])).toEqual([
      ['粉雪山玫瑰', 12],
      ['尤加利', 2],
    ])
  })

  test('发货时存配方：之后改配方，已发货订单详情不变，采购需求按新配方算待发货订单', async () => {
    const sales = await s.as('u2')
    const shipped = await idBy(s.t, 'orders.no', 'SO-260927-021')
    const bomOf = async (orderId: string) =>
      dataOf<OrderDetail>(await sales.get(`/orders/${orderId}`)).lines.map((line) => [
        line.name,
        line.bom?.map((b) => [b.materialName, b.qty]),
      ])
    const before = await bomOf(shipped)
    expect(before).toEqual([
      [
        '粉玫瑰日常花束',
        [
          ['粉雪山玫瑰', 10],
          ['尤加利', 3],
        ],
      ],
      ['白绿清新花束', [['白玫瑰', 8]]],
    ])
    // 没发货的订单不带配方
    const pending = dataOf<OrderDetail>(
      await sales.get(`/orders/${await idBy(s.t, 'orders.no', 'SO-260929-018')}`),
    )
    expect(pending.lines.every((line) => line.bom === null)).toBe(true)

    const [white] = await s.t.db.select().from(materials).where(eq(materials.name, '白玫瑰'))
    for (const customer of ['晨曦花艺', '拾光花店']) {
      const { id, catalog } = await catalogOf(customer)
      const item = itemOf(catalog, '白绿清新花束')
      dataOf(
        await sales.patch(
          `/catalog/${id}/items/${item.productId}`,
          catalogItemBody(item, { bom: [{ materialId: String(white?.id), qty: 10 }] }),
        ),
      )
    }
    expect(await bomOf(shipped)).toEqual(before)
    const sources = dataOf<OutputOf<typeof contract.listDemandSources>>(
      await (await s.as('u4')).get(`/purchase/demand/${white?.id}/sources`),
    )
    const line = sources.groups
      .flatMap((group) => group.items)
      .find((item) => item.orderNo === 'SO-260929-016')
    expect(line).toMatchObject({ qty: 20, bomQty: 10, materialQty: 200 })
  })

  test('发货后新存的配方留底', async () => {
    const sales = await s.as('u2')
    const shipper = await s.as('u7')
    const orderId = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const order = dataOf<OrderDetail>(await shipper.get(`/shipping/orders/${orderId}`))
    dataOf(
      await shipper.post(`/orders/${orderId}/ship`, {
        version: order.version,
        shipNote: '',
        lines: order.lines.map((l) => ({ orderLineId: l.id, shippedQty: l.qty })),
      }),
    )
    const shippedOrder = dataOf<OrderDetail>(await sales.get(`/orders/${orderId}`))
    expect(shippedOrder.lines[0]?.bom).toEqual([
      expect.objectContaining({ materialName: '白玫瑰', qty: 8 }),
    ])
    const { id, catalog } = await catalogOf('拾光花店')
    const item = itemOf(catalog, '白绿清新花束')
    dataOf(
      await sales.patch(
        `/catalog/${id}/items/${item.productId}`,
        catalogItemBody(item, {
          bom: item.bom.map((l) => ({ materialId: l.materialId, qty: l.qty + 1 })),
        }),
      ),
    )
    const again = dataOf<OrderDetail>(await sales.get(`/orders/${orderId}`))
    expect(again.lines[0]?.bom?.map((b) => b.qty)).toEqual([8])
  })
})

describe('从其他客户复制产品', () => {
  test('重名、停用的跳过；勾跳过的 → BUSINESS_RULE；预览过期 → STALE', async () => {
    const sales = await s.as('u2')
    const target = await idBy(s.t, 'customers.name', '一间花房')
    const sourceId = await idBy(s.t, 'customers.name', '晨曦花艺')
    const sources = dataOf<OutputOf<typeof contract.catalogCopySources>>(
      await sales.get(`/catalog/${target}/copy-sources`),
    )
    expect(sources.sources.map((c) => c.customerName)).toEqual(
      expect.arrayContaining(['晨曦花艺', '拾光花店']),
    )
    expect(sources.sources.map((c) => c.customerName)).not.toContain('一间花房')
    const same = await sales.get(`/catalog/${target}/copy-sources?fromCustomerId=${target}`)
    expect(same.body.error?.code).toBe('BUSINESS_RULE')

    const preview = dataOf<OutputOf<typeof contract.catalogCopySources>>(
      await sales.get(`/catalog/${target}/copy-sources?fromCustomerId=${sourceId}`),
    )
    expect(Object.fromEntries(preview.items.map((i) => [i.name, i.skipReason]))).toEqual({
      粉玫瑰日常花束: null,
      白绿清新花束: null,
      向日葵混合花束: 'duplicate',
      白绿桌花: 'duplicate',
    })
    const pick = (name: string) => found(preview.items.find((i) => i.name === name)).productId
    const skipped = await sales.post(`/catalog/${target}/copy`, {
      fromCustomerId: sourceId,
      productIds: [pick('白绿清新花束'), pick('白绿桌花')],
      previewToken: preview.previewToken,
    })
    expect(skipped.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '勾选的产品里有重名或已停用的，不能复制',
    })
    const stale = await sales.post(`/catalog/${target}/copy`, {
      fromCustomerId: sourceId,
      productIds: [pick('白绿清新花束')],
      previewToken: 'x'.repeat(preview.previewToken.length),
    })
    expect(stale.body.error?.code).toBe('STALE')

    const copied = dataOf<Catalog>(
      await sales.post(`/catalog/${target}/copy`, {
        fromCustomerId: sourceId,
        productIds: [pick('白绿清新花束')],
        previewToken: preview.previewToken,
      }),
    )
    // 带名称、单位、配方、价格，不带编码；没有同名分类 → 放进第一个分类
    expect(itemOf(copied, '白绿清新花束')).toMatchObject({
      unit: '束',
      listPriceCents: 7800,
      customerCode: '',
      enabled: true,
      categoryName: '礼赠花束',
      bom: [expect.objectContaining({ materialName: '白玫瑰', qty: 8 })],
    })
  })

  test('目标客户没有分类时按来源分类名新建', async () => {
    const sales = await s.as('u2')
    const sourceId = await idBy(s.t, 'customers.name', '晨曦花艺')
    const [target] = await s.t.db
      .insert(customers)
      .values({ name: '新客户', createdBy: 1 })
      .returning()
    const preview = dataOf<OutputOf<typeof contract.catalogCopySources>>(
      await sales.get(`/catalog/${target?.id}/copy-sources?fromCustomerId=${sourceId}`),
    )
    const rose = found(preview.items.find((i) => i.name === '粉玫瑰日常花束'))
    const copied = dataOf<Catalog>(
      await sales.post(`/catalog/${target?.id}/copy`, {
        fromCustomerId: sourceId,
        productIds: [rose.productId],
        previewToken: preview.previewToken,
      }),
    )
    expect(copied.categories.map((c) => c.name)).toEqual(['日常花束'])
    expect(itemOf(copied, '粉玫瑰日常花束').listPriceCents).toBe(6800)
  })
})

describe('门店订货', () => {
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
      ).patch(
        `/catalog/${id}/items/${item.productId}`,
        catalogItemBody(item, { customerCode: 'CX-999' }),
      ),
    )
    const again = dataOf<OrderDetail>(await store.get(`/orders/${order.id}`))
    expect(again.lines[0]?.customerCode).toBe('CX-101')
  })
})
