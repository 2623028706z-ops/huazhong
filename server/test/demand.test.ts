import { type contract, type OutputOf } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { materials, orders } from '../db/schema/index.ts'
import { createPo } from './support/purchase.ts'
import { dataOf, idBy, startSales, TODAY, TOMORROW, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
type Demand = OutputOf<typeof contract.listPurchaseDemand>
const demand = async (query = '') =>
  dataOf<Demand>(await (await s.as('u4')).get(`/purchase/demand${query}`))

test('B20 B22 默认区间、配方需求、库存、在途和已邀请不算在途', async () => {
  const result = await demand()
  expect(result).toMatchObject({ from: TODAY, to: '2026-10-05', orderCount: 2 })
  expect(result.mats.find((row) => row.name === '向日葵')).toMatchObject({
    needQty: 75,
    stockQty: 60,
    inTransitQty: 0,
    leftQty: -15,
    invited: true,
  })
  expect(result.mats.find((row) => row.name === '白玫瑰')).toMatchObject({
    needQty: 160,
    stockQty: 146,
    inTransitQty: 150,
    leftQty: 136,
    invited: false,
  })
  expect(result.mats.some((row) => row.name === '粉雪山玫瑰')).toBe(false)
  expect((await demand(`?from=${TODAY}&to=${TODAY}`)).mats).toEqual(result.mats)
  expect(
    (await (await s.as('u4')).get(`/purchase/demand?from=${TOMORROW}&to=${TODAY}`)).body.error
      ?.code,
  ).toBe('VALIDATION_FAILED')
  const empty = await demand('?from=2027-01-01&to=2027-01-01')
  expect(empty).toMatchObject({ mats: [], orderCount: 0 })
})
test('B21 B23 确认订单即计需求，来源按日期和订单显示', async () => {
  const orderId = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const sales = await s.as('u2')
  const order = dataOf<OutputOf<typeof contract.getOrder>>(await sales.get(`/orders/${orderId}`))
  dataOf(
    await sales.post(`/orders/${orderId}/confirm`, { version: order.version, shipDate: TOMORROW }),
  )
  const result = await demand()
  expect(result.mats.find((row) => row.name === '粉雪山玫瑰')).toMatchObject({
    needQty: 200,
    stockQty: 228,
    inTransitQty: 200,
  })
  expect(result.mats.find((row) => row.name === '白玫瑰')).toMatchObject({
    needQty: 240,
    leftQty: 56,
  })
  expect(result.mats.find((row) => row.name === '尤加利')).toMatchObject({
    needQty: 60,
    stockQty: 86,
  })
  const materialId = await idBy(s.t, 'materials.name', '白玫瑰')
  const sources = dataOf<OutputOf<typeof contract.listDemandSources>>(
    await (await s.as('u4')).get(`/purchase/demand/${materialId}/sources`),
  )
  expect(sources.groups).toMatchObject([
    {
      shipDate: TODAY,
      items: [{ orderNo: 'SO-260929-016', qty: 20, bomQty: 8, materialQty: 160 }],
    },
    {
      shipDate: TOMORROW,
      items: [{ orderNo: 'SO-260929-018', qty: 10, bomQty: 8, materialQty: 80 }],
    },
  ])
  const sunflower = await idBy(s.t, 'materials.name', '向日葵')
  const source = dataOf<OutputOf<typeof contract.listDemandSources>>(
    await (await s.as('u4')).get(`/purchase/demand/${sunflower}/sources`),
  )
  expect(source).toMatchObject({
    inTransitQty: 0,
    invites: [{ no: 'YQ-260929-001', supplierName: '春禾花材', needQty: 60 }],
  })
})
test('B24 需求生成采购单后缺口重算；B26 停用花材仍统计、过期单排除', async () => {
  const sunflower = await idBy(s.t, 'materials.name', '向日葵'),
    rose = await idBy(s.t, 'materials.name', '白玫瑰')
  await createPo(s, {
    lines: [
      { materialId: sunflower, qty: 15, priceCents: 350 },
      { materialId: rose, qty: 10, priceCents: 900 },
    ],
  })
  expect((await demand()).mats.find((row) => row.name === '向日葵')).toMatchObject({
    inTransitQty: 15,
    leftQty: 0,
  })
  expect((await demand()).mats.find((row) => row.name === '白玫瑰')?.inTransitQty).toBe(160)
  await s.t.db
    .update(materials)
    .set({ enabled: false })
    .where(eq(materials.id, Number(rose)))
  expect((await demand()).mats.find((row) => row.name === '白玫瑰')).toMatchObject({
    enabled: false,
    needQty: 160,
  })
  await s.t.db.update(orders).set({ shipDate: '2026-09-28' }).where(eq(orders.no, 'SO-260929-016'))
  expect((await demand()).mats.some((row) => row.name === '白玫瑰')).toBe(false)
})
