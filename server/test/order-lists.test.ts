// 订单列表：状态计数、日期筛选、分页、状态码（07 章 G19、J20、J23）
import type { OrderCard, OrderDetail } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { orders } from '../db/schema/index.ts'
import {
  dataOf,
  idBy,
  openStoreAccount,
  startSales,
  TODAY,
  type SalesApp,
  productIdOf,
} from './support/sales.ts'

let s: SalesApp
let c1: string
let c2: string
beforeEach(async () => {
  s = await startSales()
  c1 = await idBy(s.t, 'customers.name', '晨曦花艺')
  c2 = await idBy(s.t, 'customers.name', '拾光花店')
})
afterEach(async () => {
  await s.close()
})

interface OrderPage {
  items: OrderCard[]
  nextCursor: string | null
  counts: Record<string, number>
}

const list = async (query = '') =>
  dataOf<OrderPage>(await (await s.as('u2')).get(`/orders${query}`))

// 销售给文新店（拾光花店）新建一张待发货单，出货日期今天
async function salesOrder(): Promise<OrderDetail> {
  return dataOf<OrderDetail>(
    await (
      await s.as('u2')
    ).post('/orders', {
      customerId: c2,
      storeId: await idBy(s.t, 'stores.name', '文新店'),
      shipDate: TODAY,
      note: '',
      lines: [
        {
          productId: await productIdOf(s.t, '拾光花店', '粉玫瑰日常花束'),
          qty: 1,
          priceCents: 7000,
        },
      ],
    }),
  )
}

async function ship(order: OrderDetail): Promise<void> {
  dataOf(
    await (
      await s.as('u7')
    ).post(`/orders/${order.id}/ship`, {
      version: order.version,
      shipNote: '',
      lines: order.lines.map((l) => ({ orderLineId: l.id, shippedQty: l.qty })),
    }),
  )
}

const setOrderDate = (id: string, orderDate: string) =>
  s.t.db
    .update(orders)
    .set({ orderDate })
    .where(eq(orders.id, Number(id)))

describe('状态计数和日期筛选', () => {
  test('G19 counts 只含等待类、按客户算、不随 status 变；按下单日期筛；日期填反 422', async () => {
    // 种子：待确认 1、待发货 2、已发货 3 → 补成 2 / 3 / 5
    const rose = await productIdOf(s.t, '拾光花店', '粉玫瑰日常花束')
    const wenxin = await openStoreAccount(s, '文新店', '13800138014')
    dataOf(await wenxin.post('/store/orders', { note: '', lines: [{ productId: rose, qty: 2 }] }))
    await salesOrder()
    const sixDaysAgo = await salesOrder()
    const sevenDaysAgo = await salesOrder()
    await ship(sixDaysAgo)
    await ship(sevenDaysAgo)
    await setOrderDate(sixDaysAgo.id, '2026-09-23')
    await setOrderDate(sevenDaysAgo.id, '2026-09-22')

    const all = await list()
    expect(all.counts).toEqual({ pending_confirm: 2, to_ship: 3 })
    expect(all.items).toHaveLength(10)
    expect((await list(`?customerId=${c1}`)).counts).toEqual({ pending_confirm: 1, to_ship: 0 })
    const shipped = await list('?status=shipped')
    expect(shipped.items).toHaveLength(5)
    expect(shipped.counts).toEqual(all.counts)

    const week = await list(`?from=2026-09-23&to=${TODAY}`)
    const ids = week.items.map((o) => o.id)
    expect(ids).toContain(sixDaysAgo.id)
    expect(ids).not.toContain(sevenDaysAgo.id)

    const reversed = await (await s.as('u2')).get(`/orders?from=${TODAY}&to=2026-09-23`)
    expect(reversed.status).toBe(422)
    expect(reversed.body.error?.code).toBe('VALIDATION_FAILED')
    expect(Object.keys(reversed.body.error?.fields ?? {}).sort()).toEqual(['from', 'to'])
  })
})

describe('分页和状态码', () => {
  test('J20 25 张订单 limit=20：先 20 条带游标，再 5 条游标为 null，不重复', async () => {
    for (let i = 0; i < 19; i += 1) await salesOrder()
    const first = await list('?limit=20')
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).not.toBeNull()
    const second = await list(`?limit=20&cursor=${encodeURIComponent(first.nextCursor ?? '')}`)
    expect(second.items).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    const ids = new Set([...first.items, ...second.items].map((o) => o.id))
    expect(ids.size).toBe(25)
  })

  test('J23 订单状态只有四种码，待发货是 to_ship；?status=to_ship 只返回待发货', async () => {
    const o012 = await idBy(s.t, 'orders.no', 'SO-260928-012')
    const opened = dataOf<OrderDetail>(await (await s.as('u2')).get(`/orders/${o012}`))
    dataOf(
      await (
        await s.as('u2')
      ).post(`/orders/${o012}/cancel`, { version: opened.version, reason: '客户电话取消' }),
    )
    const statuses = new Set((await list()).items.map((o) => o.status))
    expect([...statuses].sort()).toEqual(['cancelled', 'pending_confirm', 'shipped', 'to_ship'])
    const toShip = await list('?status=to_ship')
    expect(toShip.items.map((o) => o.no)).toEqual(['SO-260929-016'])
    expect(toShip.items.every((o) => o.status === 'to_ship')).toBe(true)
  })
})
