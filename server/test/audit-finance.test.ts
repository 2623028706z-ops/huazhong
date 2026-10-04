import type { contract, OrderDetail, OutputOf, StatementDetail } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { receipts, payments, orderLines } from '../db/schema/index.ts'
import { found } from '../src/common/scope.ts'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { createPo, receiveInput } from './support/purchase.ts'
import { openStatement } from './support/statements.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

async function releaseCustomerSources() {
  const finance = await s.as('u6'),
    id = await idBy(s.t, 'statements.no', 'DZ-260929-001'),
    statement = dataOf<StatementDetail>(await finance.get(`/finance/statements/${id}`))
  dataOf(
    await finance.post(`/finance/statements/${id}/void`, {
      version: statement.version,
      reason: '重新对账',
    }),
  )
}
async function prepareSources(kind: 'receipt' | 'payment') {
  if (kind === 'receipt') await releaseCustomerSources()
  else {
    const po = await createPo(s)
    dataOf(await (await s.as('u5')).post(`/purchase-orders/${po.id}/receive`, receiveInput(po)))
  }
}

test.each(['receipt', 'payment'] as const)(
  '大量 %s 余额来源开DZ抵扣成功，首尾被消耗资金详情收到派生变更',
  async (kind) => {
    await prepareSources(kind)
    const finance = await s.as('u6'),
      actor = dataOf<{ id: string }>(await finance.get('/me')),
      customerId = Number(await idBy(s.t, 'customers.name', '晨曦花艺')),
      supplierId = Number(await idBy(s.t, 'suppliers.name', '春禾花材'))
    const base = Array.from({ length: 400 }, (_, index) => ({
      no: `AUDIT-${kind}-${index}`,
      amountCents: 1,
      creditCents: 1,
      methodName: '微信',
      createdBy: Number(actor.id),
    }))
    const history =
      kind === 'receipt'
        ? await s.t.db
            .insert(receipts)
            .values(base.map((row) => ({ ...row, customerId, receiptDate: TODAY })))
            .returning({ id: receipts.id })
        : await s.t.db
            .insert(payments)
            .values(base.map((row) => ({ ...row, supplierId, payDate: TODAY })))
            .returning({ id: payments.id })
    const topics = [history[0], history.at(-1)].map((row) => `${kind}:${found(row).id}` as const),
      ws = await connect(s.t, finance.openid)
    try {
      ws.send({ op: 'subscribe', topics })
      await ws.sync()
      const fund = dataOf<{ creditCents: number }>(
        await finance.post(`/finance/${kind}s`, {
          ...(kind === 'receipt'
            ? { customerId: String(customerId), receiptDate: TODAY }
            : { supplierId: String(supplierId), payDate: TODAY }),
          amountCents: 100,
          statements: [],
          methodName: '微信',
          note: '',
        }),
      )
      expect(fund.creditCents).toBe(100)
      const statement = await openStatement(
        s,
        kind === 'receipt' ? 'customer' : 'supplier',
        String(kind === 'receipt' ? customerId : supplierId),
      )
      expect(statement.creditDeductedCents).toBe(500)
      for (const topic of topics)
        expect(
          await ws.next((message) => message.op === 'changed' && message.topic === topic),
        ).toEqual({
          op: 'changed',
          topic,
          version: null,
        })
      for (const row of [history[0], history.at(-1)]) {
        const detail = dataOf<{ creditBalanceCents: number }>(
          await finance.get(`/finance/${kind}s/${found(row).id}`),
        )
        expect(detail.creditBalanceCents).toBe(0)
      }
    } finally {
      ws.close()
    }
  },
)

test('金额超 INTEGER 范围返回字段错误；上限可保存，DZ精确保存超过 INTEGER 的发货乘积', async () => {
  const finance = await s.as('u6'),
    seller = await s.as('u2'),
    customerId = await idBy(s.t, 'customers.name', '晨曦花艺')
  const body = {
    customerId,
    receiptDate: TODAY,
    amountCents: 2147483648,
    statements: [],
    methodName: '微信',
    note: '',
  }
  const result = await finance.post('/finance/receipts', body)
  expect(result.status).toBe(422)
  expect(result.body.error?.fields).toHaveProperty('amountCents')
  const receipt = dataOf<OutputOf<typeof contract.createReceipt>>(
    await finance.post('/finance/receipts', { ...body, amountCents: 2147483647 }),
  )
  expect(receipt.creditCents).toBe(2147483647)
  await releaseCustomerSources()
  const orderId = await idBy(s.t, 'orders.no', 'SO-260927-021')
  await s.t.db
    .update(orderLines)
    .set({ shippedQty: 2, priceCents: 1500000000 })
    .where(eq(orderLines.orderId, Number(orderId)))
  const order = dataOf<OrderDetail>(await seller.get(`/orders/${orderId}`))
  expect(order.amountCents).toBe(order.lines.length * 3000000000)
  const statement = await openStatement(s, 'customer', customerId, [{ type: 'order', id: orderId }])
  expect(statement.grossCents).toBe(order.amountCents)
  expect(statement.creditDeductedCents).toBe(2147483647)
  expect(statement.dueCents).toBe(order.amountCents - 2147483647)
})
