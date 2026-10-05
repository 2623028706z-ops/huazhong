// 必须互斥的操作（03 章第 6 节）：两个同版本请求同时发，只有一个成功；目录调价 ↔ 门店改单排队执行，只看结果
import type { AfterDetail, Catalog, OrderDetail } from '@huazhong/shared'
import { found } from '../src/common/scope.ts'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { ApiResponse } from './support/http.ts'
import {
  catalogItemBody,
  dataOf,
  idBy,
  startSales,
  TOMORROW,
  type SalesApp,
} from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const detail = async (key: 'u2' | 's1' | 'u7', id: string) =>
  dataOf<OrderDetail>(
    await (await s.as(key)).get(key === 'u7' ? `/shipping/orders/${id}` : `/orders/${id}`),
  )

// 一个 200、一个 409
function expectOneWins(results: readonly ApiResponse[]): void {
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
}

const storeEdit = (order: OrderDetail, qty: number) => ({
  version: order.version,
  note: order.note ?? '',
  lines: order.lines.map((l) => ({ productId: l.productId, qty })),
})

describe('订单', () => {
  test('确认订单 ↔ 门店改单', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const opened = await detail('u2', id)
    const results = await Promise.all([
      (await s.as('u2')).post(`/orders/${id}/confirm`, {
        version: opened.version,
        shipDate: TOMORROW,
      }),
      (await s.as('s1')).put(`/store/orders/${id}`, storeEdit(opened, 22)),
    ])
    expectOneWins(results)
    const after = await detail('u2', id)
    // 确认赢：待发货、数量没变；改单赢：还是待确认、数量 22
    if (results[0].status === 200) {
      expect(after).toMatchObject({ status: 'to_ship', changes: [] })
    } else {
      expect(after.status).toBe('pending_confirm')
      expect(after.lines.every((l) => l.qty === 22)).toBe(true)
    }
  })

  test('确认发货 ↔ 取消订单', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const opened = await detail('u7', id)
    const results = await Promise.all([
      (await s.as('u7')).post(`/orders/${id}/ship`, {
        version: opened.version,
        shipNote: '',
        lines: opened.lines.map((l) => ({ orderLineId: l.id, shippedQty: l.qty })),
      }),
      (await s.as('u2')).post(`/orders/${id}/cancel`, {
        version: opened.version,
        reason: '客户电话取消',
      }),
    ])
    expectOneWins(results)
    const status = (await detail('u2', id)).status
    expect(status).toBe(results[0].status === 200 ? 'shipped' : 'cancelled')
  })

  test('目录调价 ↔ 门店改单：调价总成功，门店要么 STALE 要么改完后单价跟着同步', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const c1 = await idBy(s.t, 'customers.name', '晨曦花艺')
    const sales = await s.as('u2')
    const catalog = dataOf<Catalog>(await sales.get(`/catalog/${c1}`))
    const rose = catalog.items.find((i) => i.name === '粉玫瑰日常花束')
    const opened = await detail('s1', id)
    const [reprice, edit] = await Promise.all([
      sales.patch(
        `/catalog/${c1}/items/${rose?.productId}`,
        catalogItemBody(found(rose), { priceCents: 7000 }),
      ),
      (await s.as('s1')).put(`/store/orders/${id}`, storeEdit(opened, 22)),
    ])
    expect(reprice.status).toBe(200)
    if (edit.status !== 200) expect(edit.body.error?.code).toBe('STALE')
    const after = await detail('u2', id)
    // 不管谁先，待确认单的单价都等于新的目录价
    expect(after.lines.find((l) => l.name === '粉玫瑰日常花束')).toMatchObject({
      priceCents: 7000,
      listPriceCents: 7000,
    })
  })
})

test('处理售后 ↔ 关闭售后', async () => {
  const id = await idBy(s.t, 'afters.no', 'AS-260929-003')
  const sales = await s.as('u2')
  const opened = dataOf<AfterDetail>(await sales.get(`/afters/${id}`))
  const results = await Promise.all([
    sales.post(`/afters/${id}/process`, {
      version: opened.version,
      note: '',
      lines: [{ id: opened.lines[0]?.id, qty: 2, priceCents: 6800 }],
    }),
    sales.post(`/afters/${id}/close`, { version: opened.version, reason: '门店撤回' }),
  ])
  expectOneWins(results)
  const status = dataOf<AfterDetail>(await sales.get(`/afters/${id}`)).status
  expect(status).toBe(results[0].status === 200 ? 'processed' : 'closed')
})
