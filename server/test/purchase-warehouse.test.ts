import { randomUUID } from 'node:crypto'
import {
  copy,
  type PaymentDetail,
  type PoDetail,
  type contract,
  type OutputOf,
} from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { payments, stockBatches, stockMoves } from '../db/schema/index.ts'
import { call } from './support/http.ts'
import { createPo, payInput, poOf, receiveInput, stockQty } from './support/purchase.ts'
import {
  codesOf,
  dataOf,
  idBy,
  startSales,
  snapshotInput,
  TODAY,
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
const returns = (po: PoDetail, qty: number) => ({
  version: po.version,
  lines: [{ poLineId: po.lines[0]?.id, qty }],
})
const price = (po: PoDetail, priceCents: number, reason = '') => ({
  version: po.version,
  reason,
  lines: [{ poLineId: po.lines[0]?.id, priceCents }],
})

test('C01 C02 C19 退货库存限制、净实收限制、流水和改价原因', async () => {
  const wh = await s.as('u5'),
    po = await poOf(s, 'PO-260928-004')
  const stockBefore = await stockQty(s, '尤加利')
  expect(
    (await wh.post(`/purchase-orders/${po.id}/returns`, returns(po, 100))).body.error?.message,
  ).toBe('尤加利库存只有 86 枝，不能退')
  const returned = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/returns`, returns(po, 10)),
  )
  expect(returned).toMatchObject({
    payableCents: 88000,
    returns: [{ items: [{ name: '尤加利', qty: 10 }] }],
  })
  expect(await stockQty(s, '尤加利')).toBe(76)
  expect(
    (await wh.post(`/purchase-orders/${po.id}/returns`, returns(returned, 111))).body.error
      ?.message,
  ).toBe('尤加利最多可退 110 枝')
  const moves = await s.t.db.select().from(stockMoves).where(eq(stockMoves.type, 'po_return'))
  expect(moves).toMatchObject([{ qty: -10, docId: Number(po.id), docType: 'po' }])
  expect(moves.reduce((sum, move) => sum + move.qty, 0)).toBe(
    (await stockQty(s, '尤加利')) - stockBefore,
  )
  const batch = await s.t.db
    .select()
    .from(stockBatches)
    .where(eq(stockBatches.id, moves[0]?.batchId ?? 0))
  expect(batch[0]).toMatchObject({ sourceType: 'po', sourceId: Number(po.id), leftQty: 76 })
  expect(
    (await wh.post(`/purchase-orders/${po.id}/reprice`, price(returned, 750))).body.error?.fields,
  ).toEqual({ reason: '请填写改价原因' })
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(returned, 750, '供应商让价')),
  )
  expect(repriced).toMatchObject({
    payableCents: 82500,
    amountCents: 96000,
    priceChanges: [{ reason: '供应商让价', items: [{ fromCents: 800, toCents: 750 }] }],
  })
})
test('B08 C04 供应商对账保留已付单，付款后仍可退货改价但不可作废', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5')
  const po = await poOf(s, 'PO-260928-004')
  const ret = dataOf<PoDetail>(await wh.post(`/purchase-orders/${po.id}/returns`, returns(po, 10)))
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(ret, 750, '供应商让价')),
  )
  const paid = dataOf<PaymentDetail>(await finance.post('/finance/payments', payInput(repriced)))
  expect(paid).toMatchObject({
    amountCents: 82500,
    status: 'valid',
    allocations: [{ docNo: po.no }],
  })
  const locked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(codesOf(locked.actions)).toEqual(['return', 'reprice'])
  expect(
    (await wh.post(`/purchase-orders/${po.id}/void`, { version: locked.version, reason: '错误' }))
      .body.error?.code,
  ).toBe('BUSINESS_RULE')
  const statement = dataOf<OutputOf<typeof contract.getFinanceSupplier>>(
    await finance.get(`/finance/suppliers/${po.supplierId}`),
  )
  expect(statement).toMatchObject({
    payableCents: 82500,
    paidCents: 82500,
    unpaidCents: 0,
    counts: { unpaid: 0, partial: 0 },
  })
  expect(statement.items[0]?.docType).toBe('po')
  const supplier = dataOf<OutputOf<typeof contract.supplierStatement>>(
    await (await s.as('p2')).get('/supplier/statement'),
  )
  expect(supplier).toMatchObject({ payableCents: 82500, paidCents: 82500, unpaidCents: 0 })
  expect(supplier.items[0]?.actions).toEqual([])
  const records = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get('/finance/records?kind=payment'),
  )
  expect(records.items[0]).toMatchObject({ id: paid.id, supplierId: po.supplierId })
  expect((await finance.post('/finance/payments', payInput(repriced))).status).toBe(409)
  expect(
    await s.t.db
      .select()
      .from(payments)
      .where(eq(payments.supplierId, Number(po.supplierId))),
  ).toHaveLength(1)
})
test('D08 B15 付款日期、幂等、作废释放核销后可退货并重新付款', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5'),
    po = await poOf(s, 'PO-260928-004')
  expect(
    (await finance.post('/finance/payments', { ...payInput(po), payDate: TOMORROW })).body.error
      ?.fields,
  ).toEqual({ payDate: '付款日期不能晚于今天' })
  const options = {
    openid: finance.openid,
    body: await snapshotInput(s.t, finance.openid, '/finance/payments', payInput(po)),
    idempotencyKey: randomUUID(),
  }
  const paid = dataOf<PaymentDetail>(await call(s.t, 'POST', '/finance/payments', options))
  expect(dataOf(await call(s.t, 'POST', '/finance/payments', options))).toEqual(paid)
  expect(
    (await finance.post(`/finance/payments/${paid.id}/void`, { version: paid.version, reason: '' }))
      .body.error?.fields,
  ).toEqual({ reason: '请填写作废原因' })
  const voided = dataOf<PaymentDetail>(
    await finance.post(`/finance/payments/${paid.id}/void`, {
      version: paid.version,
      reason: '付错供应商账户',
    }),
  )
  expect(voided).toMatchObject({ status: 'voided', voidReason: '付错供应商账户', actions: [] })
  const after = dataOf<PoDetail>(await finance.get(`/purchase-orders/${po.id}`))
  expect(after.apStatus).toBe('unpaid')
  expect(codesOf(after.actions)).not.toContain('pay')
  const locked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(codesOf(locked.actions)).toContain('return')
  const returned = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/returns`, returns(locked, 1)),
  )
  dataOf(await finance.post('/finance/payments', payInput(returned)))
})
test('B16 付款复核新金额，失败不写付款', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5'),
    po = await poOf(s, 'PO-260928-004')
  const input = await snapshotInput(s.t, finance.openid, '/finance/payments', payInput(po))
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(po, 750, '供应商让价')),
  )
  const stale = await finance.post('/finance/payments', input)
  expect(stale.body.error).toMatchObject({
    code: 'STALE',
    message: copy.rework.ledgerStale,
    latest: { items: [{ payableCents: 90000 }] },
  })
  expect(await s.t.db.select().from(payments)).toHaveLength(0)
  expect(
    dataOf<PaymentDetail>(await finance.post('/finance/payments', payInput(repriced))).amountCents,
  ).toBe(90000)
})
test('B13 B30 C03 零应付、整单拒收和全部退货不进入财务', async () => {
  const wh = await s.as('u5'),
    finance = await s.as('u6')
  const gift = await createPo(s, {
    lines: [{ materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 10, priceCents: 0 }],
  })
  const received = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${gift.id}/receive`, receiveInput(gift)),
  )
  expect(received).toMatchObject({ status: 'received', apStatus: 'no_pay', payableCents: 0 })
  const returned = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${gift.id}/returns`, returns(received, 10)),
  )
  expect(returned).toMatchObject({ allReturned: true, payableCents: 0 })
  expect(codesOf(returned.actions)).toEqual(['voidPo'])
  expect(
    (await wh.post(`/purchase-orders/${gift.id}/reprice`, price(returned, 100, '改价'))).status,
  ).toBe(409)
  const manual = await poOf(s),
    before = await stockQty(s, '白玫瑰')
  const rejected = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${manual.id}/receive`, {
      ...receiveInput(manual),
      lines: receiveInput(manual).lines.map((line) => ({ ...line, receivedQty: 0 })),
    }),
  )
  expect(rejected).toMatchObject({ status: 'rejected', payableCents: 0, actions: [] })
  expect(await stockQty(s, '白玫瑰')).toBe(before)
  const payable = dataOf<OutputOf<typeof contract.listPayables>>(
    await finance.get('/finance/payables'),
  )
  expect(payable.items.map((row) => row.id)).toEqual([
    await idBy(s.t, 'purchase_orders.no', 'PO-260928-004'),
  ])
  expect(
    dataOf<OutputOf<typeof contract.supplierPurchaseOrders>>(
      await (await s.as('p2')).get('/supplier/purchase-orders'),
    ).items.some((row) => row.status === 'rejected'),
  ).toBe(true)
})
test('库存退货先扣本单，再 FIFO；实收允许超过采购量', async () => {
  const materialId = await idBy(s.t, 'materials.name', '尤加利'),
    wh = await s.as('u5')
  const po = await createPo(s, { lines: [{ materialId, qty: 10, priceCents: 800 }] })
  const received = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/receive`, {
      ...receiveInput(po),
      lines: receiveInput(po).lines.map((line) => ({ ...line, receivedQty: 20 })),
    }),
  )
  expect(received.payableCents).toBe(16000)
  await s.t.db
    .update(stockBatches)
    .set({ leftQty: 4 })
    .where(and(eq(stockBatches.sourceType, 'po'), eq(stockBatches.sourceId, Number(po.id))))
  dataOf(await wh.post(`/purchase-orders/${po.id}/returns`, returns(received, 10)))
  const moves = await s.t.db
    .select()
    .from(stockMoves)
    .where(and(eq(stockMoves.docId, Number(po.id)), eq(stockMoves.type, 'po_return')))
  expect(moves.map((row) => row.qty)).toEqual([-4, -6])
  const stock = dataOf<OutputOf<typeof contract.warehouseStock>>(await wh.get('/warehouse/stock'))
  const item = stock.items.find((row) => row.id === materialId)
  expect(item?.batches.some((row) => row.inDate === TODAY && row.leftQty === 0)).toBe(true)
})
