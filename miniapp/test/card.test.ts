// 列表卡新样式（02 章第 6 节第 18 条）：日期短格式、小字连接、零值不显示、门店 / 员工的大字
import { describe, expect, it } from 'vitest'
import { copy, type AfterCard, type OrderCard } from '@huazhong/shared'
import { cardAmountOf, cardDateOf, shipOnOf, subOf, summaryOf } from '../miniprogram/views/card'
import { orderRowOf } from '../miniprogram/views/order'
import { afterRowOf } from '../miniprogram/views/after'

const order: OrderCard = {
  id: 'o1',
  no: 'SO-260928-001',
  version: 1,
  status: 'pending_confirm',
  origin: 'store',
  orderDate: '2026-09-27',
  shipDate: null,
  customerId: 'c1',
  customerName: '拾光花店',
  storeId: 's1',
  storeName: '文新店',
  lineName: '粉玫瑰日常花束',
  lineCount: 2,
  units: [{ unit: '束', qty: 20 }],
  amountCents: 214000,
  changed: false,
  repriced: false,
  cancelRequested: false,
  unseen: true,
  actions: [],
  lockedReason: null,
}

describe('列表卡', () => {
  it('今年的日期写「09-28 周一」，往年写完整日期', () => {
    expect(cardDateOf('2026-09-28', '2026-10-06')).toBe('09-28 周一')
    expect(cardDateOf('2025-12-28', '2026-10-06')).toBe('2025-12-28 周日')
  })

  it('小字只连有值的项；金额 0 和 null 不显示', () => {
    expect(subOf(['A', '', null, undefined, false, 'B'])).toBe('A · B')
    expect(cardAmountOf(0)).toBe('')
    expect(cardAmountOf(null)).toBe('')
    expect(cardAmountOf(12345)).toBe('¥123.45')
    expect(summaryOf([])).toBe('')
    expect(summaryOf(['玫瑰', '百合'])).toBe(copy.order.moreItems('玫瑰', 2))
  })

  it('出货日期没定写「出货日期待定」', () => {
    expect(shipOnOf(null)).toBe(copy.flow.common.shipDateTbd)
  })

  it('门店订单卡大字出货日期、带小红点；员工大字客户 · 门店，不带小红点', () => {
    const store = orderRowOf(order, true)
    expect(store).toMatchObject({ main: copy.flow.common.shipDateTbd, serif: true, dot: true })
    expect(store.sub).toBe(`${copy.order.moreItems('粉玫瑰日常花束', 2)} · SO-260928-001`)
    expect(store.amount).toBe('¥2,140.00')
    const staff = orderRowOf(order, false)
    expect(staff.main).toBe(copy.org.store('拾光花店', '文新店'))
    expect(staff.sub).toBe(`${copy.flow.common.shipDateTbd} · SO-260928-001`)
    expect(staff.dot).toBe(false)
  })

  it('售后卡：门店大字问题产品，员工小字原订单在前；没有金额不显示', () => {
    const after: AfterCard = {
      ...order,
      no: 'AS-260929-003',
      status: 'pending',
      origin: 'store',
      afterDate: '2026-09-29',
      orderId: 'o1',
      orderNo: 'SO-260927-026',
      shipDate: '2026-09-27',
      amountCents: null,
      lineName: '白玫瑰花束',
      lineCount: 1,
    } as unknown as AfterCard
    const store = afterRowOf(after, true)
    expect(store.main).toBe('白玫瑰花束')
    expect(store.amount).toBe('')
    expect(afterRowOf(after, false).sub.startsWith('SO-260927-026 · ')).toBe(true)
  })
})
