// 订单推送不越权：只推给相关门店的连接，推送里不带订单内容（07 章 H09，05 章第 12 节）
import type { OrderDetail, ServerMessage } from '@huazhong/shared'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  dataOf,
  idBy,
  openStoreAccount,
  startSales,
  TODAY,
  type SalesApp,
} from './support/sales.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const orderChange = (m: ServerMessage) => m.op === 'changed' && m.topic.startsWith('order:')

test('H09 销售改城西店的单：只有城西店收到，滨江店收不到；推送只有 topic 和 version', async () => {
  const sales = await s.as('u2')
  const created = dataOf<OrderDetail>(
    await sales.post('/orders', {
      customerId: await idBy(s.t, 'customers.name', '晨曦花艺'),
      storeId: await idBy(s.t, 'stores.name', '城西店'),
      shipDate: TODAY,
      note: '',
      lines: [
        { productId: await idBy(s.t, 'products.name', '粉玫瑰日常花束'), qty: 3, priceCents: 6800 },
      ],
    }),
  )
  const o018 = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const binjiang = await connect(s.t, (await s.as('s1')).openid)
  const chengxi = await connect(s.t, (await openStoreAccount(s, '城西店', '13800138012')).openid)
  binjiang.send({ op: 'subscribe', topics: [`order:${created.id}`, `order:${o018}`] })
  chengxi.send({ op: 'subscribe', topics: [`order:${created.id}`] })
  await binjiang.sync()
  await chengxi.sync()

  const edited = dataOf<OrderDetail>(
    await sales.put(`/orders/${created.id}`, {
      version: created.version,
      shipDate: TODAY,
      note: '',
      reason: '门店加量',
      lines: [{ productId: created.lines[0]?.productId, qty: 5, priceCents: 6800 }],
    }),
  )
  expect(await chengxi.next(orderChange)).toEqual({
    op: 'changed',
    topic: `order:${created.id}`,
    version: edited.version,
  })

  // 滨江店自己改单作为哨兵：它收到的第一条订单推送必须是自己的单
  const opened = dataOf<OrderDetail>(await (await s.as('s1')).get(`/orders/${o018}`))
  dataOf(
    await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, {
      version: opened.version,
      note: '',
      lines: opened.lines.map((l) => ({ productId: l.productId, qty: l.qty + 1 })),
    }),
  )
  expect(await binjiang.next(orderChange)).toMatchObject({ topic: `order:${o018}` })
  binjiang.close()
  chengxi.close()
})
