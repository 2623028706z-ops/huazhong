// 财务收款：客户对账、登记收款、核销、预收、作废收款、作废售后、门店对账（07 章 A18、A22、D01–D07、D11–D13）
import type { AfterDetail, ArCard, OrderDetail, ReceiptDetail, TodoItem } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  codesOf,
  dataOf,
  idBy,
  startSales,
  TODAY,
  TOMORROW,
  type SalesApp,
} from './support/sales.ts'

let s: SalesApp
let c1: string
let o026: string
let o021: string
beforeEach(async () => {
  s = await startSales()
  c1 = await idBy(s.t, 'customers.name', '晨曦花艺')
  o026 = await idBy(s.t, 'orders.no', 'SO-260927-026')
  o021 = await idBy(s.t, 'orders.no', 'SO-260927-021')
})
afterEach(async () => {
  await s.close()
})

interface ArCustomerPage {
  items: ArCard[]
  actions: { code: string }[]
  shippedCents: number
  afterCents: number
  receivedCents: number
  unpaidCents: number
  prepaidCents: number
}

async function ar(query = ''): Promise<ArCustomerPage> {
  return dataOf<ArCustomerPage>(await (await s.as('u6')).get(`/finance/customers/${c1}${query}`))
}

// 客户对账五元组：发货金额 / 售后 / 已收 / 未收 / 预收
async function tuple(): Promise<number[]> {
  const page = await ar()
  return [
    page.shippedCents,
    page.afterCents,
    page.receivedCents,
    page.unpaidCents,
    page.prepaidCents,
  ]
}

const arOrder = async (id: string) =>
  dataOf<
    ArCard & {
      afters: { id: string; actions: { code: string }[] }[]
      allocations: { kind: string }[]
    }
  >(await (await s.as('u6')).get(`/finance/ar-orders/${id}`))

const receipt = (
  amountCents: number,
  allocs: { orderId: string; amountCents: number }[],
  extra = {},
) => ({
  customerId: c1,
  receiptDate: TODAY,
  amountCents,
  methodName: '转账',
  note: '',
  allocs,
  ...extra,
})

async function salesAfter(
  orderId: string,
  lines: { name: string; qty: number }[],
): Promise<AfterDetail> {
  const order = dataOf<OrderDetail>(await (await s.as('u2')).get(`/orders/${orderId}`))
  const body = {
    orderId,
    note: '',
    lines: lines.map((l) => {
      const line = order.lines.find((ol) => ol.name === l.name)
      return {
        orderLineId: line?.id,
        qty: l.qty,
        priceCents: line?.priceCents,
        reason: 'qty_mismatch',
        description: '',
      }
    }),
  }
  return dataOf<AfterDetail>(await (await s.as('u2')).post('/afters', body))
}

describe('对账起点和待办', () => {
  test('D01 起点五元组、财务待办列有预收的客户', async () => {
    expect(await tuple()).toEqual([358800, 0, 100000, 258800, 0])
    const todos = dataOf<{ count: number; items: TodoItem[] }>(
      await (await s.as('u6')).get('/modules/finance/todos'),
    )
    expect(todos.count).toBe(2)
    expect(todos.items.find((item) => item.kind === 'payable')).toMatchObject({
      payable: { no: 'PO-260928-004', unpaidCents: 96000, docType: 'po' },
    })
    expect(todos.items.filter((item) => item.kind === 'prepaid')).toEqual([
      {
        kind: 'prepaid',
        customerId: await idBy(s.t, 'customers.name', '拾光花店'),
        customerName: '拾光花店',
        prepaidCents: 6400,
      },
    ])
  })

  test('E09 门店对账只列本店发货单：发货金额 − 售后 − 已付 = 待付', async () => {
    const page = dataOf<ArCustomerPage & { paidCents: number }>(
      await (await s.as('s1')).get('/store/statement'),
    )
    expect(page.items.map((i) => i.orderNo)).toEqual(['SO-260927-021'])
    expect([page.shippedCents, page.afterCents, page.paidCents, page.unpaidCents]).toEqual([
      148800, 0, 100000, 48800,
    ])
    expect(page.items[0]?.payStatus).toBe('partial')
  })
})

describe('收款、核销、作废', () => {
  test('D02–D07 登记收款 → 收清后再售后转预收 → 作废收款 → 核销预收', async () => {
    const finance = await s.as('u6')
    const over = await finance.post(
      '/finance/receipts',
      receipt(300000, [{ orderId: o026, amountCents: 220000 }]),
    )
    expect(over.body.error?.fields).toEqual({
      'allocs.0.amountCents': 'SO-260927-026 最多核销 ¥2,100.00',
    })
    const allocs = [
      { orderId: o026, amountCents: 210000 },
      { orderId: o021, amountCents: 48800 },
    ]
    const registered = dataOf<ReceiptDetail>(
      await finance.post('/finance/receipts', receipt(300000, allocs)),
    )
    expect(registered).toMatchObject({ status: 'valid', prepaidCents: 41200 })
    expect(await tuple()).toEqual([358800, 0, 358800, 0, 41200])
    expect(codesOf((await ar()).actions)).toEqual(['registerReceipt'])

    // D03 门店对账
    const store = dataOf<ArCustomerPage & { paidCents: number }>(
      await (await s.as('s1')).get('/store/statement'),
    )
    expect([store.shippedCents, store.paidCents, store.unpaidCents]).toEqual([148800, 148800, 0])

    // D04 收清后处理售后：多出来的回到预收
    const sales = await s.as('u2')
    const asId = await idBy(s.t, 'afters.no', 'AS-260929-003')
    const pending = dataOf<AfterDetail>(await sales.get(`/afters/${asId}`))
    const lines = [{ id: pending.lines[0]?.id, qty: 2, priceCents: 6800 }]
    dataOf(
      await sales.post(`/afters/${asId}/process`, { version: pending.version, note: '', lines }),
    )
    expect(await tuple()).toEqual([358800, 13600, 345200, 0, 54800])
    const card026 = await arOrder(o026)
    expect(card026).toMatchObject({
      shippedCents: 210000,
      afterCents: 13600,
      receivableCents: 196400,
      receivedCents: 196400,
    })
    expect(card026.afters.map((a) => codesOf(a.actions))).toEqual([[]])

    // D05 作废 SK-260928-001：核销撤回
    const old = dataOf<ReceiptDetail>(
      await finance.get(`/finance/receipts/${await idBy(s.t, 'receipts.no', 'SK-260928-001')}`),
    )
    const blank = await finance.post(`/finance/receipts/${old.id}/void`, {
      version: old.version,
      reason: '',
    })
    expect(blank.body.error?.fields).toEqual({ reason: '请填写作废原因' })
    const voided = dataOf<ReceiptDetail>(
      await finance.post(`/finance/receipts/${old.id}/void`, {
        version: old.version,
        reason: '重复登记',
      }),
    )
    expect(voided).toMatchObject({
      status: 'voided',
      voidReason: '重复登记',
      actions: [],
      prepaidCents: 0,
    })
    expect(voided.notice).toBe('已作废，核销已撤回。')
    expect(await tuple()).toEqual([358800, 13600, 245200, 100000, 54800])

    // D07 核销预收：不超过可用预收
    const tooMuch = await finance.post('/finance/prepaid-allocations', {
      customerId: c1,
      allocs: [{ orderId: o021, amountCents: 60000 }],
    })
    expect(tooMuch.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '可用预收只有 ¥548.00',
    })
    const used = await finance.post('/finance/prepaid-allocations', {
      customerId: c1,
      allocs: [{ orderId: o021, amountCents: 54800 }],
    })
    expect(dataOf(used)).toEqual({ customerId: c1, prepaidCents: 0 })
    expect(await tuple()).toEqual([358800, 13600, 300000, 45200, 0])
    const card021 = await arOrder(o021)
    expect(card021).toMatchObject({ payStatus: 'partial', unpaidCents: 45200 })
    expect(card021.allocations.map((a) => a.kind)).toEqual(['direct', 'direct', 'prepaid'])

    const records = dataOf<{ items: unknown[]; counts: object }>(
      await finance.get('/finance/records?status=voided'),
    )
    expect(records.items).toHaveLength(1)
    expect(records.counts).toEqual({})
  })

  test('D12 收款日期不能晚于今天，可以补录昨天', async () => {
    const finance = await s.as('u6')
    const future = await finance.post(
      '/finance/receipts',
      receipt(10000, [], { receiptDate: TOMORROW }),
    )
    expect(future.body.error?.fields).toEqual({ receiptDate: '收款日期不能晚于今天' })
    const saved = dataOf<ReceiptDetail>(
      await finance.post('/finance/receipts', receipt(10000, [], { receiptDate: '2026-09-28' })),
    )
    expect(saved).toMatchObject({ receiptDate: '2026-09-28', prepaidCents: 10000 })
    expect(codesOf((await ar()).actions)).toEqual(['registerReceipt', 'allocate'])
  })

  test('D13 对账按出货日期筛：对账格按区间算，预收不受影响', async () => {
    const allocs = [
      { orderId: o026, amountCents: 210000 },
      { orderId: o021, amountCents: 48800 },
    ]
    dataOf(await (await s.as('u6')).post('/finance/receipts', receipt(300000, allocs)))
    const day28 = await ar('?from=2026-09-28&to=2026-09-28')
    expect(day28.items).toHaveLength(2)
    expect([
      day28.shippedCents,
      day28.afterCents,
      day28.receivedCents,
      day28.unpaidCents,
      day28.prepaidCents,
    ]).toEqual([358800, 0, 358800, 0, 41200])
    const day29 = await ar('?from=2026-09-29&to=2026-09-29')
    expect([
      day29.items.length,
      day29.shippedCents,
      day29.receivedCents,
      day29.prepaidCents,
    ]).toEqual([0, 0, 0, 41200])
    const store = dataOf<{ items: unknown[]; shippedCents: number }>(
      await (await s.as('s1')).get('/store/statement?from=2026-09-29&to=2026-09-29'),
    )
    expect([store.items.length, store.shippedCents]).toEqual([0, 0])
  })
})

describe('售后和应收', () => {
  test('A18 售后刚好抵完：应收 0、已收、售后抵扣；原来的核销回到预收', async () => {
    await salesAfter(o021, [
      { name: '粉玫瑰日常花束', qty: 15 },
      { name: '白绿清新花束', qty: 6 },
    ])
    expect(await arOrder(o021)).toMatchObject({
      receivableCents: 0,
      offsetByAfter: true,
      payStatus: 'paid',
      receivedCents: 0,
    })
    expect((await tuple())[4]).toBe(100000)
  })

  test('A22 财务只读，由销售作废售后：未收回到原值，弹层不再列这张', async () => {
    const after = await salesAfter(o021, [{ name: '粉玫瑰日常花束', qty: 2 }])
    expect((await arOrder(o021)).unpaidCents).toBe(48800 - 13600)
    const voided = await (
      await s.as('u2')
    ).post(`/afters/${after.id}/void`, { version: after.version, reason: '重复登记' })
    expect(dataOf<AfterDetail>(voided)).toMatchObject({ status: 'voided', voidReason: '重复登记' })
    const card = await arOrder(o021)
    expect(card.unpaidCents).toBe(48800)
    expect(card.afters).toEqual([])
  })
})

describe('收付款方式', () => {
  test('D11 停用的收款方式不能再用；每份至少保留一种启用', async () => {
    const finance = await s.as('u6')
    const methods = dataOf<{ items: { id: string; kind: string; name: string }[] }>(
      await finance.get('/finance/methods'),
    )
    const idOf = (kind: string, name: string) =>
      methods.items.find((m) => m.kind === kind && m.name === name)?.id
    dataOf(await finance.patch(`/finance/methods/${idOf('receive', '微信')}`, { enabled: false }))
    const res = await finance.post('/finance/receipts', receipt(10000, [], { methodName: '微信' }))
    expect(res.body.error?.fields).toEqual({ methodName: '这种收款方式已停用，请换一种' })
    for (const name of ['转账', '微信', '支付宝']) {
      dataOf(await finance.patch(`/finance/methods/${idOf('pay', name)}`, { enabled: false }))
    }
    const last = await finance.patch(`/finance/methods/${idOf('pay', '现金')}`, { enabled: false })
    expect(last.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '至少要保留一种启用的方式',
    })
  })
})
