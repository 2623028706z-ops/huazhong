// 订单：改单、确认、编辑后确认、取消（07 章 A06、A07、A10–A16、A31、J17、J25）
import { orderUpdateSchema, type OrderDetail } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { codesOf, dataOf, idBy, startSales, TOMORROW, type SalesApp } from './support/sales.ts'

let s: SalesApp
let o018: string
let o016: string
let o012: string
beforeEach(async () => {
  s = await startSales()
  o018 = await idBy(s.t, 'orders.no', 'SO-260929-018')
  o016 = await idBy(s.t, 'orders.no', 'SO-260929-016')
  o012 = await idBy(s.t, 'orders.no', 'SO-260928-012')
})
afterEach(async () => {
  await s.close()
})

const detail = async (key: 'u2' | 's1' | 'u7' | 'u1', id: string) =>
  dataOf<OrderDetail>(
    await (await s.as(key)).get(key === 'u7' ? `/shipping/orders/${id}` : `/orders/${id}`),
  )

// 按详情原样组一份修改内容，改掉某个产品的数量
function salesEdit(
  order: OrderDetail,
  qtys: Record<string, number>,
  reason: string,
  shipDate = TOMORROW,
) {
  return {
    version: order.version,
    shipDate: order.shipDate ?? shipDate,
    note: order.note ?? '',
    reason,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      qty: qtys[l.name] ?? l.qty,
      priceCents: l.priceCents,
    })),
  }
}

function storeEdit(order: OrderDetail, qtys: Record<string, number>) {
  return {
    version: order.version,
    note: order.note ?? '',
    lines: order.lines.map((l) => ({ productId: l.productId, qty: qtys[l.name] ?? l.qty })),
  }
}

describe('actions 按账号和状态', () => {
  test('J17 待确认：销售取消 / 编辑后确认 / 确认，门店取消 / 修改，发货读不到', async () => {
    expect(codesOf((await detail('u2', o018)).actions)).toEqual(['cancel', 'confirm'])
    expect(codesOf((await detail('s1', o018)).actions)).toEqual(['storeCancel', 'storeEdit'])
    expect((await (await s.as('u7')).get(`/orders/${o018}`)).status).toBe(403)
    expect((await (await s.as('u7')).get(`/shipping/orders/${o018}`)).status).toBe(404)
  })

  test('J25 取消的 reasonRequired：待确认 false、待发货 true；门店 false；待发货不带原因 → fields.reason', async () => {
    const cancelOf = (o: OrderDetail) => o.actions.find((a) => a.code === 'cancel')
    expect(cancelOf(await detail('u2', o018))?.reasonRequired).toBe(false)
    const toShip = await detail('u2', o016)
    expect(cancelOf(toShip)?.reasonRequired).toBe(true)
    expect((await detail('s1', o018)).actions[0]).toMatchObject({
      code: 'storeCancel',
      reasonRequired: false,
    })
    const res = await (await s.as('u2')).post(`/orders/${o016}/cancel`, { version: toShip.version })
    expect(res.status).toBe(422)
    expect(res.body.error?.fields).toEqual({ reason: '请填写原因' })
  })

  test('待发货：门店看到 lockedReason，销售取消、修改，发货确认发货', async () => {
    const store = await s.as('s1')
    const sales = await detail('u2', o018)
    await (
      await s.as('u2')
    ).post(`/orders/${o018}/confirm`, { version: sales.version, shipDate: TOMORROW })
    const view = await detail('s1', o018)
    expect(codesOf(view.actions)).toEqual(['requestCancel'])
    expect(view.lockedReason).toBe('销售已确认，如需修改请联系花众销售')
    expect(codesOf((await detail('u2', o016)).actions)).toEqual(['cancel', 'edit'])
    expect(codesOf((await detail('u7', o016)).actions)).toEqual(['ship'])
    expect(store.openid).toBeTruthy()
  })
})

describe('销售修改订单', () => {
  test('A06 改数量写变更记录；不改内容再保存报「没有修改内容」', async () => {
    const sales = await s.as('u2')
    const before = await detail('u2', o012)
    const saved = dataOf<OrderDetail>(
      await sales.put(`/orders/${o012}`, salesEdit(before, { 向日葵混合花束: 18 }, '门店加量')),
    )
    expect(saved.changes).toHaveLength(1)
    expect(saved.changes[0]).toMatchObject({
      actorLabel: '李敏',
      reason: '门店加量',
      items: ['向日葵混合花束 数量 15 → 18'],
    })
    expect(saved.changed).toBe(true)
    const again = await sales.put(`/orders/${o012}`, salesEdit(saved, {}, '再确认一次'))
    expect(again.status).toBe(409)
    expect(again.body.error?.message).toBe('没有修改内容')
    expect((await detail('u2', o012)).changes).toHaveLength(1)
  })

  test('A15 修改原因选填：改单接口不写原因也通过校验', () => {
    const body = {
      version: 1,
      shipDate: TOMORROW,
      note: '',
      lines: [{ productId: '1', qty: 1, priceCents: 100 }],
    }
    expect(orderUpdateSchema.safeParse(body).success).toBe(true)
  })

  test('A16 编辑后确认途中门店改单 → STALE 带最新数量；再保存变成待发货、变更记录 2 条', async () => {
    const sales = await s.as('u2')
    const opened = await detail('u2', o018)
    await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, storeEdit(await detail('s1', o018), { 粉玫瑰日常花束: 21 }))
    const stale = await sales.post(
      `/orders/${o018}/confirm`,
      salesEdit(opened, { 粉玫瑰日常花束: 25 }, '按电话沟通加量'),
    )
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({
      code: 'STALE',
      message: '订单刚被修改过，已刷新成最新内容，请核对后再保存',
    })
    const latest = stale.body.error?.latest as OrderDetail
    expect(latest.lines.find((l) => l.name === '粉玫瑰日常花束')?.qty).toBe(21)
    const saved = dataOf<OrderDetail>(
      await sales.post(
        `/orders/${o018}/confirm`,
        salesEdit(latest, { 粉玫瑰日常花束: 25 }, '按电话沟通加量'),
      ),
    )
    expect(saved.status).toBe('to_ship')
    expect(saved.shipDate).toBe(TOMORROW)
    expect(saved.changes.map((c) => c.items)).toEqual([
      ['粉玫瑰日常花束 数量 20 → 21'],
      ['粉玫瑰日常花束 数量 21 → 25'],
    ])
    expect(saved.changes[1]?.reason).toBe('按电话沟通加量')
    expect((await detail('s1', o018)).changes).toHaveLength(2)
  })
})

describe('门店改单', () => {
  test('A07 改数量写变更记录，原因为 null', async () => {
    const saved = dataOf<OrderDetail>(
      await (
        await s.as('s1')
      ).put(`/store/orders/${o018}`, storeEdit(await detail('s1', o018), { 粉玫瑰日常花束: 22 })),
    )
    expect(saved.changes).toEqual([
      expect.objectContaining({ reason: null, items: ['粉玫瑰日常花束 数量 20 → 22'] }),
    ])
  })

  test('A10 改单途中被销售取消 → 「订单已被取消，不能再修改」', async () => {
    const opened = await detail('s1', o018)
    const sales = await detail('u2', o018)
    await (await s.as('u2')).post(`/orders/${o018}/cancel`, { version: sales.version })
    const res = await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, storeEdit(opened, { 粉玫瑰日常花束: 22 }))
    expect(res.body.error).toMatchObject({ code: 'STALE', message: '订单已被取消，不能再修改' })
  })

  test('A11 改单途中被销售确认 → 「销售已确认…」，数量不变', async () => {
    const opened = await detail('s1', o018)
    const sales = await detail('u2', o018)
    await (
      await s.as('u2')
    ).post(`/orders/${o018}/confirm`, { version: sales.version, shipDate: TOMORROW })
    const res = await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, storeEdit(opened, { 粉玫瑰日常花束: 22 }))
    expect(res.body.error).toMatchObject({
      code: 'STALE',
      message: '销售已确认，门店不能再修改，请联系销售',
    })
    expect((await detail('u2', o018)).lines[0]?.qty).toBe(20)
  })

  test('内容没变不写变更记录，直接返回', async () => {
    const opened = await detail('s1', o018)
    const saved = dataOf<OrderDetail>(
      await (await s.as('s1')).put(`/store/orders/${o018}`, storeEdit(opened, {})),
    )
    expect(saved.version).toBe(opened.version)
    expect(saved.changes).toEqual([])
  })
})
