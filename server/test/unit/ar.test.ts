// 应收、已收、未收、预收的纯函数（03 章第 4 节、04 章第 8 节）
import { describe, expect, test } from 'vitest'
import {
  drawPrepaid,
  replayLedger,
  summaryOf,
  toArCard,
  type LedgerOrder,
  type LedgerReceipt,
} from '../../src/modules/finance/domain/ar.ts'

const order = (orderId: number, shippedCents: number, afterCents = 0): LedgerOrder => ({
  orderId,
  orderNo: `SO-260929-00${orderId}`,
  storeId: 1,
  storeName: '滨江店',
  shipDate: '2026-09-28',
  units: [{ unit: '束', qty: 1 }],
  shippedCents,
  afterCents,
})

const receipt = (id: number, amountCents: number, receiptDate = '2026-09-28'): LedgerReceipt => ({
  id,
  no: `SK-260928-00${id}`,
  receiptDate,
  amountCents,
})

describe('replayLedger', () => {
  test('按登记顺序核销，剩下的是预收', () => {
    const replay = replayLedger(
      [order(1, 1000), order(2, 500)],
      [receipt(10, 2000)],
      [
        { id: 100, receiptId: 10, orderId: 1, amountCents: 1000 },
        { id: 101, receiptId: 10, orderId: 2, amountCents: 500 },
      ],
    )
    expect(replay.received.get(1)).toBe(1000)
    expect(replay.received.get(2)).toBe(500)
    expect(replay.left.get(10)).toBe(500)
    expect(replay.effective.get(101)).toBe(500)
  })

  test('售后后来冲减应收：超出的部分回到收款预收，不算两次', () => {
    const replay = replayLedger(
      [order(1, 1000, 300)],
      [receipt(10, 1000)],
      [{ id: 100, receiptId: 10, orderId: 1, amountCents: 1000 }],
    )
    expect(replay.effective.get(100)).toBe(700)
    expect(replay.received.get(1)).toBe(700)
    expect(replay.left.get(10)).toBe(300)
  })

  test('发货单已收清、收款已用完的核销生效金额为 0，不在 effective 里', () => {
    const replay = replayLedger(
      [order(1, 500), order(2, 500)],
      [receipt(10, 500)],
      [
        { id: 100, receiptId: 10, orderId: 1, amountCents: 500 },
        { id: 101, receiptId: 10, orderId: 1, amountCents: 100 },
        { id: 102, receiptId: 10, orderId: 2, amountCents: 100 },
      ],
    )
    expect([...replay.effective.keys()]).toEqual([100])
    expect(replay.left.get(10)).toBe(0)
  })

  test('售后超过发货金额时应收按 0 算', () => {
    const replay = replayLedger(
      [order(1, 500, 800)],
      [receipt(10, 100)],
      [{ id: 100, receiptId: 10, orderId: 1, amountCents: 100 }],
    )
    expect(replay.received.get(1)).toBe(0)
    expect(replay.left.get(10)).toBe(100)
  })
})

describe('toArCard', () => {
  test('未收、部分收、已收', () => {
    expect(toArCard(order(1, 1000), 0)).toMatchObject({ unpaidCents: 1000, payStatus: 'unpaid' })
    expect(toArCard(order(1, 1000), 400)).toMatchObject({ unpaidCents: 600, payStatus: 'partial' })
    expect(toArCard(order(1, 1000), 1000)).toMatchObject({ unpaidCents: 0, payStatus: 'paid' })
  })

  test('售后刚好抵完：应收 0、已收，offsetByAfter；没售后的 0 元单不算抵完', () => {
    expect(toArCard(order(1, 1000, 1000), 0)).toMatchObject({
      receivableCents: 0,
      payStatus: 'paid',
      offsetByAfter: true,
    })
    expect(toArCard(order(1, 0), 0).offsetByAfter).toBe(false)
  })
})

describe('drawPrepaid', () => {
  test('按收款日期、id 先后扣，跨收款拆成多条', () => {
    const receipts = [
      receipt(12, 300, '2026-09-29'),
      receipt(11, 200, '2026-09-28'),
      receipt(10, 100, '2026-09-28'),
    ]
    const left = new Map([
      [10, 100],
      [11, 200],
      [12, 300],
    ])
    expect(drawPrepaid(receipts, left, [{ orderId: 1, amountCents: 250 }])).toEqual([
      { receiptId: 10, orderId: 1, amountCents: 100 },
      { receiptId: 11, orderId: 1, amountCents: 150 },
    ])
  })

  test('多张发货单接着扣剩下的；余额 0 的收款跳过', () => {
    const receipts = [receipt(10, 100), receipt(11, 200)]
    const left = new Map([
      [10, 0],
      [11, 200],
    ])
    expect(
      drawPrepaid(receipts, left, [
        { orderId: 1, amountCents: 50 },
        { orderId: 2, amountCents: 150 },
      ]),
    ).toEqual([
      { receiptId: 11, orderId: 1, amountCents: 50 },
      { receiptId: 11, orderId: 2, amountCents: 150 },
    ])
  })
})

test('summaryOf 合计四项', () => {
  const cards = [toArCard(order(1, 1000, 100), 300), toArCard(order(2, 500), 500)]
  expect(summaryOf(cards)).toEqual({
    shippedCents: 1500,
    afterCents: 100,
    receivedCents: 800,
    unpaidCents: 600,
  })
})
