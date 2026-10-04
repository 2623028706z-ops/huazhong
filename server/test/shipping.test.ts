// 确认发货、新建订单、出货日期（07 章 A08、A09、A20、A23、A36、I04）
import { type OrderDetail, type TodoRow } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { dataOf, idBy, startSales, TODAY, TOMORROW, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const detail = async (key: 'u2' | 'u7' | 's1', id: string) =>
  dataOf<OrderDetail>(
    await (await s.as(key)).get(key === 'u7' ? `/shipping/orders/${id}` : `/orders/${id}`),
  )

function editOf(order: OrderDetail, change: { qty?: number; shipDate?: string }, reason: string) {
  return {
    version: order.version,
    shipDate: change.shipDate ?? order.shipDate,
    note: order.note ?? '',
    reason,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      qty: change.qty ?? l.qty,
      priceCents: l.priceCents,
    })),
  }
}

const shipAll = (order: OrderDetail, shipNote = '') => ({
  version: order.version,
  shipNote,
  lines: order.lines.map((l) => ({ orderLineId: l.id, shippedQty: l.qty })),
})

async function shippingTodoNos(): Promise<string[]> {
  const due = dataOf<{ items: { no: string }[] }>(
    await (await s.as('u7')).get('/shipping/orders?dueOnly=true'),
  )
  return due.items.map((item) => item.no)
}

describe('确认发货', () => {
  test('A08 发货页开着时销售改单 → STALE 带最新数量；按最新再确认 → 已发货', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260928-012')
    const sales = await s.as('u2')
    dataOf(
      await sales.put(`/orders/${id}`, editOf(await detail('u2', id), { qty: 18 }, '门店加量')),
    )
    const opened = await detail('u7', id)
    expect(opened.changed).toBe(true)
    dataOf(
      await sales.put(`/orders/${id}`, editOf(await detail('u2', id), { qty: 20 }, '再加两束')),
    )
    const stale = await (await s.as('u7')).post(`/orders/${id}/ship`, shipAll(opened))
    expect(stale.body.error).toMatchObject({
      code: 'STALE',
      message: '销售修改了这张订单，已刷新成最新内容，请核对后再确认发货',
    })
    const latest = stale.body.error?.latest as OrderDetail
    expect(latest).toMatchObject({ status: 'to_ship' })
    expect(latest.lines[0]?.qty).toBe(20)
    expect(latest.changes[1]).toMatchObject({
      items: ['向日葵混合花束 数量 18 → 20'],
      reason: '再加两束',
    })
    const shipped = dataOf<OrderDetail>(
      await (await s.as('u7')).post(`/orders/${id}/ship`, shipAll(latest)),
    )
    expect(shipped.status).toBe('shipped')
  })

  test('A09 发货页开着时订单被取消 → 「销售已取消这张订单，不能发货」', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const opened = await detail('u7', id)
    const sales = await detail('u2', id)
    dataOf(
      await (
        await s.as('u2')
      ).post(`/orders/${id}/cancel`, { version: sales.version, reason: '客户电话取消' }),
    )
    const res = await (await s.as('u7')).post(`/orders/${id}/ship`, shipAll(opened))
    expect(res.body.error).toMatchObject({ code: 'STALE', message: '销售已取消这张订单，不能发货' })
    expect((await detail('u2', id)).status).toBe('cancelled')
  })

  test('A23 全 0 不能发；少发、多发的发货备注选填，不写也能发，按实发算', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const ship = await s.as('u7')
    const opened = await detail('u7', id)
    const lineId = opened.lines[0]?.id ?? ''
    const short = {
      version: opened.version,
      shipNote: '',
      lines: [{ orderLineId: lineId, shippedQty: 18 }],
    }
    const none = { ...short, lines: [{ orderLineId: lineId, shippedQty: 0 }] }
    expect((await ship.post(`/orders/${id}/ship`, none)).body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '至少发出一项产品；整单不发请联系销售取消订单',
    })
    const done = dataOf<OrderDetail>(await ship.post(`/orders/${id}/ship`, short))
    expect(done.lines[0]).toMatchObject({ shippedQty: 18, short: true })
    expect(done).toMatchObject({ status: 'shipped', shippedBy: '赵磊' })
    expect(done.shipNote ?? '').toBe('')
  })

  test('I04 已发货的订单不能再改、不能再发', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260927-021')
    const order = await detail('u2', id)
    const edit = await (await s.as('u2')).put(`/orders/${id}`, editOf(order, { qty: 1 }, '改实发'))
    expect(edit.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '订单已发货，不能再修改',
    })
    const again = await (await s.as('u7')).post(`/orders/${id}/ship`, shipAll(order))
    expect(again.body.error).toMatchObject({ code: 'BUSINESS_RULE', message: '这张订单已经发货' })
  })
})

describe('出货日期', () => {
  test('A20 销售补录过去的出货日期', async () => {
    const created = dataOf<OrderDetail>(
      await (
        await s.as('u2')
      ).post('/orders', {
        customerId: await idBy(s.t, 'customers.name', '晨曦花艺'),
        storeId: await idBy(s.t, 'stores.name', '滨江店'),
        shipDate: '2026-01-05',
        note: '',
        lines: [
          {
            productId: await idBy(s.t, 'products.name', '粉玫瑰日常花束'),
            qty: 3,
            priceCents: 6800,
          },
        ],
      }),
    )
    expect(created).toMatchObject({
      status: 'to_ship',
      shipDate: '2026-01-05',
      orderDate: TODAY,
      origin: 'sales',
    })
    expect(created.no).toMatch(/^SO-260929-\d{3}$/)
  })

  test('A36 出货日期没到不能发；待办里没有、待发货列表里有；改成今天后能发', async () => {
    const created = dataOf<OrderDetail>(
      await (
        await s.as('u2')
      ).post('/orders', {
        customerId: await idBy(s.t, 'customers.name', '晨曦花艺'),
        storeId: await idBy(s.t, 'stores.name', '滨江店'),
        shipDate: TOMORROW,
        note: '',
        lines: [
          {
            productId: await idBy(s.t, 'products.name', '粉玫瑰日常花束'),
            qty: 3,
            priceCents: 6800,
          },
        ],
      }),
    )
    const opened = await detail('u7', created.id)
    expect(opened.actions).toEqual([
      {
        code: 'ship',
        enabled: false,
        disabledReason: '出货日期还没到，不能发货',
        reasonRequired: false,
      },
    ])
    expect(await shippingTodoNos()).not.toContain(created.no)
    const list = dataOf<{ items: { no: string }[] }>(
      await (await s.as('u7')).get('/shipping/orders?status=to_ship'),
    )
    expect(list.items.map((o) => o.no)).toContain(created.no)
    const early = await (await s.as('u7')).post(`/orders/${created.id}/ship`, shipAll(opened))
    expect(early.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '出货日期还没到，不能发货',
    })
    dataOf(
      await (
        await s.as('u2')
      ).put(
        `/orders/${created.id}`,
        editOf(await detail('u2', created.id), { shipDate: TODAY }, '提前送'),
      ),
    )
    expect(await shippingTodoNos()).toContain(created.no)
    const due = await detail('u7', created.id)
    expect(
      dataOf<OrderDetail>(await (await s.as('u7')).post(`/orders/${created.id}/ship`, shipAll(due)))
        .status,
    ).toBe('shipped')
  })

  test('发货单不传状态：待发货在前（出货日期升序）、已发货在后；跨段翻页不重不漏；counts 照旧', async () => {
    const later = dataOf<OrderDetail>(
      await (
        await s.as('u2')
      ).post('/orders', {
        customerId: await idBy(s.t, 'customers.name', '晨曦花艺'),
        storeId: await idBy(s.t, 'stores.name', '滨江店'),
        shipDate: TOMORROW,
        note: '',
        lines: [
          {
            productId: await idBy(s.t, 'products.name', '粉玫瑰日常花束'),
            qty: 1,
            priceCents: 6800,
          },
        ],
      }),
    )
    const ship = await s.as('u7')
    type Page = {
      items: { no: string; status: string; shipDate: string | null }[]
      nextCursor: string | null
      counts: Record<string, number>
    }
    const read = async (query: string) => dataOf<Page>(await ship.get(`/shipping/orders${query}`))
    const toShip = await read('?status=to_ship&limit=50')
    const shipped = await read('?status=shipped&limit=50')
    const all = await read('?limit=50')
    expect(all.items.map((o) => o.no)).toEqual([
      ...toShip.items.map((o) => o.no),
      ...shipped.items.map((o) => o.no),
    ])
    expect(all.items.map((o) => o.status)).toEqual([
      ...Array<string>(3).fill('to_ship'),
      ...Array<string>(3).fill('shipped'),
    ])
    const dates = toShip.items.map((o) => o.shipDate ?? '')
    expect(dates).toEqual([...dates].sort())
    expect(toShip.items.at(-1)?.no).toBe(later.no)
    expect(all.counts).toEqual({ to_ship: 3 })

    for (const limit of [1, 2, 3, 4, 5]) {
      const nos: string[] = []
      let cursor: string | null = null
      do {
        const query = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
        const page = await read(`?limit=${String(limit)}${query}`)
        nos.push(...page.items.map((o) => o.no))
        cursor = page.nextCursor
      } while (cursor !== null)
      expect(nos).toEqual(all.items.map((o) => o.no))
    }

    // 已发货段的游标不能拿去翻待发货
    const firstShipped = await read('?status=shipped&limit=1')
    const wrong = await ship.get(
      `/shipping/orders?status=to_ship&cursor=${encodeURIComponent(firstShipped.nextCursor ?? '')}`,
    )
    expect(wrong.status).toBe(422)
  })

  test('发货待办只算到期的，按出货日期升序', async () => {
    const todos = dataOf<{ count: number }>(await (await s.as('u7')).get('/modules/shipping/todos'))
    expect(todos.count).toBe(2)
    // 两张都是今天出货，同一天按录入先后
    expect(await shippingTodoNos()).toEqual(['SO-260929-016', 'SO-260928-012'])
  })

  test('H3 发货待办和发货单都不带金额、改价标记', async () => {
    const ship = await s.as('u7')
    const todos = dataOf<{ rows: TodoRow[] }>(await ship.get('/modules/shipping/todos'))
    const list = dataOf<{ items: Record<string, unknown>[] }>(await ship.get('/shipping/orders'))
    expect(todos.rows).toEqual([{ key: 'dueShipments', label: '今日应发', count: 2 }])
    const cards = list.items
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(card).not.toHaveProperty('amountCents')
      expect(card).not.toHaveProperty('repriced')
    }
  })
})
