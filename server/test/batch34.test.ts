// 2026-10-06 体验改版第 3、4 批：到货差异告诉采购、门店已看过、批量发货勾选（往来排序、花材权限、供应商搜索见 batch34-lists）
import type {
  AfterDetail,
  contract,
  OrderCard,
  OrderDetail,
  OutputOf,
  PoDetail,
  StoreUnseen,
} from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createPo, receiveInput } from './support/purchase.ts'
import { codesOf, dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { uploadAfterImage } from './support/images.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

type Todos = OutputOf<typeof contract.moduleTodos>
const diffTodo = async () =>
  dataOf<Todos>(await (await s.as('u4')).get('/modules/purchase/todos')).rows.find(
    (row) => row.key === 'poDiffs',
  )?.count

describe('到货有差异', () => {
  test('实收少于下单进采购待办；知道了消掉；再改价重新进待办', async () => {
    const purchase = await s.as('u4'),
      wh = await s.as('u5')
    const po = await createPo(s)
    const before = (await diffTodo()) ?? 0
    const input = receiveInput(po)
    const received = dataOf<PoDetail>(
      await wh.post(`/purchase-orders/${po.id}/receive`, {
        ...input,
        lines: input.lines.map((line) => ({ ...line, receivedQty: 50 })),
      }),
    )
    // 差异只给这张单的采购员和管理员：仓库拿不到差异，也没有「知道了」
    expect(received.diff).toBeNull()
    expect(received.diffUnseen).toBe(false)
    expect(codesOf(received.actions)).not.toContain('ackDiff')
    const whCards = dataOf<OutputOf<typeof contract.listPurchaseOrders>>(
      await wh.get('/purchase-orders'),
    )
    expect(whCards.items.find((row) => row.id === po.id)?.diffUnseen).toBe(false)
    const detail = dataOf<PoDetail>(await purchase.get(`/purchase-orders/${po.id}`))
    expect(detail.diff).toMatchObject({
      unseen: true,
      notice: '到货和下单不一样',
      receivedBy: '陈青',
      byName: '陈青',
      lines: [
        { name: '向日葵', qty: 60, receivedQty: 50, short: true, repriced: false, returnedQty: 0 },
      ],
    })
    expect(codesOf(detail.actions)).toContain('ackDiff')
    expect(detail.diffUnseen).toBe(true)
    expect(await diffTodo()).toBe(before + 1)
    const filtered = dataOf<OutputOf<typeof contract.listPurchaseOrders>>(
      await purchase.get('/purchase-orders?diffUnseen=true'),
    )
    expect(filtered.items.map((row) => row.id)).toEqual([po.id])
    // 仓库不能点知道了
    expect(
      (await wh.post(`/purchase-orders/${po.id}/ack-diff`, { version: detail.version })).status,
    ).toBe(403)
    const acked = dataOf<PoDetail>(
      await purchase.post(`/purchase-orders/${po.id}/ack-diff`, { version: detail.version }),
    )
    expect(acked.diff).toMatchObject({ unseen: false })
    expect(acked.diff?.seenAt).not.toBeNull()
    expect(acked.version).toBe(detail.version)
    expect(codesOf(acked.actions)).not.toContain('ackDiff')
    expect(await diffTodo()).toBe(before)
    // 重复点：照常返回
    expect(
      (await purchase.post(`/purchase-orders/${po.id}/ack-diff`, { version: acked.version }))
        .status,
    ).toBe(200)
    // 仓库再改价：重新进待办；采购拿旧版本点知道了 → STALE
    s.clock.set('2026-09-29T03:00:00.000Z')
    const repriced = dataOf<PoDetail>(
      await wh.post(`/purchase-orders/${po.id}/reprice`, {
        version: received.version,
        reason: '',
        lines: [{ poLineId: received.lines[0]?.id, priceCents: 300 }],
      }),
    )
    expect(await diffTodo()).toBe(before + 1)
    const stale = await purchase.post(`/purchase-orders/${po.id}/ack-diff`, {
      version: acked.version,
    })
    expect(stale.body.error?.code).toBe('STALE')
    const latest = dataOf<PoDetail>(await purchase.get(`/purchase-orders/${po.id}`))
    expect(latest.version).toBe(repriced.version)
    expect(latest.diff?.lines[0]).toMatchObject({
      orderPriceCents: 350,
      priceCents: 300,
      repriced: true,
    })
    // 退货也算
    dataOf(await purchase.post(`/purchase-orders/${po.id}/ack-diff`, { version: latest.version }))
    s.clock.set('2026-09-29T04:00:00.000Z')
    dataOf(
      await wh.post(`/purchase-orders/${po.id}/returns`, {
        version: latest.version,
        lines: [{ poLineId: latest.lines[0]?.id, qty: 5 }],
      }),
    )
    expect(await diffTodo()).toBe(before + 1)
    expect(
      dataOf<PoDetail>(await purchase.get(`/purchase-orders/${po.id}`)).diff?.lines[0]?.returnedQty,
    ).toBe(5)
  })

  test('照单收货没有差异；作废已收货的单算差异；管理员也能看到、点知道了', async () => {
    const wh = await s.as('u5'),
      admin = await s.as('u1')
    const po = await createPo(s)
    const received = dataOf<PoDetail>(
      await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
    )
    expect(received.diff).toBeNull()
    expect(received.diffUnseen).toBe(false)
    const adminTodo = async () =>
      dataOf<Todos>(await admin.get('/modules/purchase/todos')).rows.find(
        (row) => row.key === 'poDiffs',
      )?.count ?? 0
    const before = await adminTodo()
    const voided = dataOf<PoDetail>(
      await wh.post(`/purchase-orders/${po.id}/void`, {
        version: received.version,
        reason: '录错了',
      }),
    )
    expect(voided.diff).toBeNull()
    const adminDetail = dataOf<PoDetail>(await admin.get(`/purchase-orders/${po.id}`))
    expect(adminDetail.diffUnseen).toBe(true)
    expect(adminDetail.diff).toMatchObject({
      voided: true,
      rejectedAll: false,
      rejectReason: null,
      unseen: true,
      lines: [],
    })
    expect(await adminTodo()).toBe(before + 1)
    expect(codesOf(adminDetail.actions)).toContain('ackDiff')
    dataOf(await admin.post(`/purchase-orders/${po.id}/ack-diff`, { version: voided.version }))
    expect(await adminTodo()).toBe(before)
  })

  test('整单拒收单独标记，带拒收原因，不逐行列', async () => {
    const po = await createPo(s)
    const input = receiveInput(po)
    const rejected = dataOf<PoDetail>(
      await (
        await s.as('u5')
      ).post(`/purchase-orders/${po.id}/receive`, {
        ...input,
        recvNote: '花头全烂了',
        lines: input.lines.map((line) => ({ ...line, receivedQty: 0 })),
      }),
    )
    expect(rejected.status).toBe('rejected')
    const detail = dataOf<PoDetail>(await (await s.as('u4')).get(`/purchase-orders/${po.id}`))
    expect(detail.diff).toMatchObject({
      rejectedAll: true,
      rejectReason: '花头全烂了',
      lines: [],
      unseen: true,
    })
  })

  test('多收也算差异', async () => {
    const po = await createPo(s)
    const input = receiveInput(po)
    const received = dataOf<PoDetail>(
      await (
        await s.as('u5')
      ).post(`/purchase-orders/${po.id}/receive`, {
        ...input,
        lines: input.lines.map((line) => ({ ...line, receivedQty: 70 })),
      }),
    )
    expect(received.diff).toBeNull()
    const detail = dataOf<PoDetail>(await (await s.as('u4')).get(`/purchase-orders/${po.id}`))
    expect(detail.diff?.lines).toMatchObject([{ receivedQty: 70, over: true, short: false }])
  })
})

describe('门店已看过', () => {
  const unseen = async () => dataOf<StoreUnseen>(await (await s.as('s1')).get('/store/unseen'))

  test('售后关闭后门店角标 +1，打开详情消掉', async () => {
    const store = await s.as('s1'),
      sales = await s.as('u2')
    const orderId = await idBy(s.t, 'orders.no', 'SO-260927-021')
    const order = dataOf<OrderDetail>(await store.get(`/orders/${orderId}`))
    const line = order.lines.find((row) => row.name === '粉玫瑰日常花束')
    const imageFileId = await uploadAfterImage(s, store)
    const after = dataOf<AfterDetail>(
      await store.post('/store/afters', {
        orderId,
        lines: [
          {
            orderLineId: line?.id,
            qty: 1,
            reason: 'damaged',
            description: '花头折损',
            imageFileIds: [imageFileId],
          },
        ],
      }),
    )
    const start = await unseen()
    expect(after.unseen).toBe(false)
    dataOf(
      await sales.post(`/afters/${after.id}/close`, { version: after.version, reason: '已沟通' }),
    )
    expect(await unseen()).toMatchObject({
      afters: start.afters + 1,
      total: start.total + 1,
    })
    const list = dataOf<OutputOf<typeof contract.listAfters>>(await store.get('/afters'))
    expect(list.items.find((row) => row.id === after.id)?.unseen).toBe(true)
    // 员工端恒为 false
    const staff = dataOf<OutputOf<typeof contract.listAfters>>(await sales.get('/afters'))
    expect(staff.items.find((row) => row.id === after.id)?.unseen).toBe(false)
    const seen = dataOf<StoreUnseen>(await store.post(`/store/afters/${after.id}/seen`))
    expect(seen).toEqual(start)
    // 重复调用没有副作用
    expect(dataOf<StoreUnseen>(await store.post(`/store/afters/${after.id}/seen`))).toEqual(start)
    expect((await store.post('/store/afters/999999/seen')).status).toBe(404)
  })

  test('销售代建的售后提醒门店；看过后被作废再提醒', async () => {
    const store = await s.as('s1'),
      sales = await s.as('u2')
    const orderId = await idBy(s.t, 'orders.no', 'SO-260927-021')
    const order = dataOf<OrderDetail>(await sales.get(`/orders/${orderId}`))
    const line = order.lines.find((row) => row.name === '粉玫瑰日常花束')
    const start = await unseen()
    const after = dataOf<AfterDetail>(
      await sales.post('/afters', {
        orderId,
        note: '',
        lines: [
          {
            orderLineId: line?.id,
            qty: 1,
            priceCents: line?.priceCents,
            reason: 'qty_mismatch',
            description: '',
          },
        ],
      }),
    )
    expect((await unseen()).afters).toBe(start.afters + 1)
    dataOf(await store.post(`/store/afters/${after.id}/seen`))
    expect((await unseen()).afters).toBe(start.afters)
    s.clock.set('2026-09-29T03:00:00.000Z')
    dataOf(
      await sales.post(`/afters/${after.id}/void`, { version: after.version, reason: '录错了' }),
    )
    expect((await unseen()).afters).toBe(start.afters + 1)
  })

  test('取消申请被拒绝后订单亮红点，打开详情消掉', async () => {
    const store = await s.as('s1'),
      sales = await s.as('u2')
    const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const pending = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
    dataOf(await sales.post(`/orders/${id}/confirm`, { version: pending.version, shipDate: TODAY }))
    const initial = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
    const requested = dataOf<OrderDetail>(
      await store.post(`/store/orders/${id}/cancel-request`, {
        version: initial.version,
        reason: '',
      }),
    )
    const start = await unseen()
    dataOf(await sales.post(`/orders/${id}/cancel-request/reject`, { version: requested.version }))
    expect((await unseen()).orders).toBe(start.orders + 1)
    const list = dataOf<OutputOf<typeof contract.listOrders>>(await store.get('/orders'))
    expect(list.items.find((row) => row.id === id)?.unseen).toBe(true)
    expect(dataOf<StoreUnseen>(await store.post(`/store/orders/${id}/seen`)).orders).toBe(
      start.orders,
    )
    expect(
      dataOf<OutputOf<typeof contract.listOrders>>(await store.get('/orders')).items.find(
        (row) => row.id === id,
      )?.unseen,
    ).toBe(false)
  })
})

describe('门店订单排序和搜索', () => {
  const ranks: Record<OrderCard['status'], number> = {
    pending_confirm: 0,
    to_ship: 1,
    shipped: 2,
    cancelled: 3,
    voided: 3,
  }
  const rank = (row: OrderCard) => ranks[row.status]
  test('待确认最前，待发货按出货日期近→远，已发货按出货日期倒序；翻页不重不漏', async () => {
    const store = await s.as('s1')
    const all = dataOf<OutputOf<typeof contract.listOrders>>(await store.get('/orders?limit=50'))
    const order = all.items.map(rank)
    expect([...order].sort()).toEqual(order)
    expect(new Set(order).size).toBeGreaterThan(1)
    const open = all.items.filter((row) => rank(row) === 1).map((row) => row.shipDate ?? '')
    expect([...open].sort()).toEqual(open)
    const shipped = all.items.filter((row) => rank(row) === 2).map((row) => row.shipDate ?? '')
    expect([...shipped].sort().reverse()).toEqual(shipped)
    const paged: string[] = []
    let cursor: string | null = null
    do {
      const query: string = cursor === null ? '' : `&cursor=${cursor}`
      const page: OutputOf<typeof contract.listOrders> = dataOf(
        await store.get(`/orders?limit=2${query}`),
      )
      paged.push(...page.items.map((row) => row.id))
      cursor = page.nextCursor
    } while (cursor !== null)
    expect(paged).toEqual(all.items.map((row) => row.id))
  })

  test('门店按产品名搜索', async () => {
    const store = await s.as('s1')
    const found = dataOf<OutputOf<typeof contract.listOrders>>(
      await store.get(`/orders?q=${encodeURIComponent('粉玫瑰')}`),
    )
    expect(found.items.length).toBeGreaterThan(0)
    for (const row of found.items) {
      const detail = dataOf<OrderDetail>(await store.get(`/orders/${row.id}`))
      expect(detail.lines.some((line) => line.name.includes('粉玫瑰'))).toBe(true)
    }
    const none = dataOf<OutputOf<typeof contract.listOrders>>(
      await store.get(`/orders?q=${encodeURIComponent('不存在的产品')}`),
    )
    expect(none.items).toEqual([])
  })

  test('选订单页：afterable 列出的门店订单都带可用的 applyAfter', async () => {
    const list = dataOf<OutputOf<typeof contract.listOrders>>(
      await (await s.as('s1')).get('/orders?afterable=true'),
    )
    expect(list.items.length).toBeGreaterThan(0)
    for (const row of list.items)
      expect(row.actions.find((action) => action.code === 'applyAfter')?.enabled).toBe(true)
  })
})

test('发货单：出货日期没到的单 ship 动作禁用（不能勾选）', async () => {
  const sales = await s.as('u2')
  const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const pending = dataOf<OrderDetail>(await sales.get(`/orders/${id}`))
  dataOf(
    await sales.post(`/orders/${id}/confirm`, { version: pending.version, shipDate: '2026-10-08' }),
  )
  const list = dataOf<OutputOf<typeof contract.listShippingOrders>>(
    await (await s.as('u7')).get('/shipping/orders?status=to_ship'),
  )
  const card = list.items.find((row) => row.id === id)
  expect(card?.actions.map(({ code, enabled }) => ({ code, enabled }))).toEqual([
    { code: 'ship', enabled: false },
  ])
  expect(typeof card?.actions[0]?.disabledReason).toBe('string')
  expect(card).not.toHaveProperty('unseen')
})
