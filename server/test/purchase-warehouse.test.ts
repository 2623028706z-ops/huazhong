import { randomUUID } from 'node:crypto'
import { type PaymentDetail, type PoDetail, type contract, type OutputOf } from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { payments, stockBatches, stockMoves } from '../db/schema/index.ts'
import { call } from './support/http.ts'
import { createPo, payInput, poOf, receiveInput, stockQty } from './support/purchase.ts'
import { openStatement, statementInput } from './support/statements.ts'
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
    amountCents: 88000,
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
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(returned, 750, '供应商让价')),
  )
  expect(repriced).toMatchObject({
    amountCents: 82500,
    priceChanges: [{ reason: '供应商让价', items: [{ fromCents: 800, toCents: 750 }] }],
  })
  // 改价原因选填：不填也能改
  const again = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(repriced, 700)),
  )
  expect(again.priceChanges.map((change) => change.reason)).toContain('')
})
test('B08 C04 有效DZ锁定采购来源；付款与作废付款都不解锁，先作废DZ才可退货改价', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5')
  const po = await poOf(s, 'PO-260928-004')
  const ret = dataOf<PoDetail>(await wh.post(`/purchase-orders/${po.id}/returns`, returns(po, 10)))
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(ret, 750, '供应商让价')),
  )
  expect(repriced.amountCents).toBe(82500)
  const statement = await openStatement(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  expect(statement.dueCents).toBe(82500)
  const locked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(codesOf(locked.actions)).toEqual(['return', 'reprice', 'voidPo'])
  expect(locked.actions.every((action) => !action.enabled)).toBe(true)
  for (const [suffix, body] of [
    ['void', { version: locked.version, reason: '错误' }],
    ['returns', returns(locked, 1)],
    ['reprice', price(locked, 700, '重新议价')],
  ] as const) {
    expect((await wh.post(`/purchase-orders/${po.id}/${suffix}`, body)).body.error?.code).toBe(
      'BUSINESS_RULE',
    )
  }
  const paymentInput = await payInput(s, locked)
  const paid = dataOf<PaymentDetail>(await finance.post('/finance/payments', paymentInput))
  expect(paid).toMatchObject({
    amountCents: 82500,
    status: 'valid',
    statements: [{ id: statement.id }],
  })
  const ledger = dataOf<OutputOf<typeof contract.getFinanceSupplier>>(
    await finance.get(`/finance/suppliers/${po.supplierId}`),
  )
  expect(ledger).toMatchObject({ unsettledCents: 0, unstatementedCents: 0 })
  const supplier = dataOf<OutputOf<typeof contract.supplierStatementDetail>>(
    await (await s.as('p2')).get(`/supplier/statements/${statement.id}`),
  )
  expect(supplier).toMatchObject({ dueCents: 82500, status: 'settled', actions: [] })
  expect((await finance.post('/finance/payments', paymentInput)).status).toBe(409)
  dataOf(
    await finance.post(`/finance/payments/${paid.id}/void`, {
      version: paid.version,
      reason: '付错账号',
    }),
  )
  const stillLocked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(stillLocked.statement?.status).toBe('unsettled')
  expect(stillLocked.actions.every((action) => !action.enabled)).toBe(true)
  const latest = dataOf<OutputOf<typeof contract.getStatement>>(
    await finance.get(`/finance/statements/${statement.id}`),
  )
  dataOf(
    await finance.post(`/finance/statements/${statement.id}/void`, {
      version: latest.version,
      reason: '重新核对',
    }),
  )
  const unlocked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(unlocked.statement).toBeNull()
  expect(unlocked.actions.every((action) => action.enabled)).toBe(true)
  dataOf(await wh.post(`/purchase-orders/${po.id}/returns`, returns(unlocked, 1)))
})
test('D08 B15 付款日期、幂等、作废付款重开DZ；来源持续锁定', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5'),
    po = await poOf(s, 'PO-260928-004')
  const input = await payInput(s, po)
  expect(
    (await finance.post('/finance/payments', { ...input, payDate: TOMORROW })).body.error?.fields,
  ).toEqual({ payDate: '付款日期不能晚于今天' })
  const options = { openid: finance.openid, body: input, idempotencyKey: randomUUID() }
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
  expect(after.statement?.status).toBe('unsettled')
  expect(after.actions).toEqual([])
  const locked = dataOf<PoDetail>(await wh.get(`/purchase-orders/${po.id}`))
  expect(
    (await wh.post(`/purchase-orders/${po.id}/returns`, returns(locked, 1))).body.error?.code,
  ).toBe('BUSINESS_RULE')
  dataOf(await finance.post('/finance/payments', await payInput(s, after)))
})
test('B16 新建DZ复核来源金额，旧快照失败不写对账单或付款', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5'),
    po = await poOf(s, 'PO-260928-004')
  const input = await statementInput(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${po.id}/reprice`, price(po, 750, '供应商让价')),
  )
  const stale = await finance.post('/finance/statements', input)
  expect(stale.body.error?.code).toBe('STALE')
  expect(await s.t.db.select().from(payments)).toHaveLength(0)
  expect(
    dataOf<PaymentDetail>(await finance.post('/finance/payments', await payInput(s, repriced)))
      .amountCents,
  ).toBe(90000)
})
test('B13 B30 C03 零元和全退采购可进候选，整单拒收不进入候选', async () => {
  const wh = await s.as('u5'),
    finance = await s.as('u6')
  const gift = await createPo(s, {
    lines: [{ materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 10, priceCents: 0 }],
  })
  const received = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${gift.id}/receive`, receiveInput(gift)),
  )
  expect(received).toMatchObject({ status: 'received', amountCents: 0 })
  const returned = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${gift.id}/returns`, returns(received, 10)),
  )
  expect(returned).toMatchObject({ allReturned: true, amountCents: 0 })
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
  expect(rejected).toMatchObject({ status: 'rejected', amountCents: 0, actions: [] })
  expect(await stockQty(s, '白玫瑰')).toBe(before)
  const draft = dataOf<OutputOf<typeof contract.statementDraft>>(
    await finance.get(`/finance/statements/draft?kind=supplier&partyId=${gift.supplierId}`),
  )
  expect(
    draft.sources.find((source) => source.type === 'po' && source.id === gift.id)?.amountCents,
  ).toBe(0)
  expect(draft.sources.some((source) => source.type === 'po' && source.id === manual.id)).toBe(
    false,
  )
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
  expect(received.amountCents).toBe(16000)
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
  expect(item?.batches.every((row) => row.leftQty > 0)).toBe(true)
  const sourceBatches = await s.t.db
    .select()
    .from(stockBatches)
    .where(and(eq(stockBatches.sourceType, 'po'), eq(stockBatches.sourceId, Number(po.id))))
  expect(sourceBatches.some((row) => row.inDate === TODAY && row.leftQty === 0)).toBe(true)
})
