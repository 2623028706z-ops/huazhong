import { type contract, type OrderDetail, type OutputOf } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { accounts, accountModules } from '../db/schema/index.ts'
import { found } from '../src/common/scope.ts'
import { startSales, dataOf, idBy, TODAY, type SalesApp, productIdOf } from './support/sales.ts'
let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
test('A47 A54 取消和作废非归属人403，兼岗财务售后专用投影仍只读', async () => {
  const sales = await s.as('u2'),
    other = await s.as('u3'),
    admin = await s.as('u1')
  const otherRow = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, other.openid)))[0],
  )
  await s.t.db
    .insert(accountModules)
    .values({ accountId: otherRow.id, module: 'sales' })
    .onConflictDoNothing()
  const created = dataOf<OrderDetail>(
    await sales.post('/orders', {
      customerId: await idBy(s.t, 'customers.name', '晨曦花艺'),
      storeId: await idBy(s.t, 'stores.name', '滨江店'),
      shipDate: TODAY,
      note: '',
      lines: [
        {
          productId: await productIdOf(s.t, '晨曦花艺', '粉玫瑰日常花束'),
          qty: 1,
          priceCents: 6800,
        },
      ],
    }),
  )
  const view = dataOf<OrderDetail>(await other.get(`/orders/${created.id}`))
  expect(view.actions.find((action) => action.code === 'cancel')?.enabled).toBe(false)
  expect(
    await other.post(`/orders/${created.id}/cancel`, { version: created.version, reason: '越权' }),
  ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
  expect(
    (
      await admin.post(`/orders/${created.id}/cancel`, {
        version: created.version,
        reason: '管理纠错',
      })
    ).status,
  ).toBe(200)
  const orderId = await idBy(s.t, 'orders.no', 'SO-260927-026')
  const order = dataOf<OrderDetail>(await sales.get(`/orders/${orderId}`))
  const after = dataOf<OutputOf<typeof contract.createAfter>>(
    await sales.post('/afters', {
      orderId,
      note: '',
      lines: [
        {
          orderLineId: found(order.lines[0]).id,
          qty: 1,
          priceCents: found(order.lines[0]).priceCents,
          reason: 'qty_mismatch',
          description: '',
        },
      ],
    }),
  )
  const otherAfter = dataOf<OutputOf<typeof contract.getAfter>>(
    await other.get(`/afters/${after.id}`),
  )
  expect(otherAfter.actions.find((action) => action.code === 'voidAfter')?.enabled).toBe(false)
  expect(
    await other.post(`/afters/${after.id}/void`, { version: after.version, reason: '越权' }),
  ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
  const owner = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, sales.openid)))[0],
  )
  await s.t.db.insert(accountModules).values({ accountId: owner.id, module: 'finance' })
  expect(
    dataOf<OutputOf<typeof contract.getFinanceAfter>>(
      await sales.get(`/finance/afters/${after.id}`),
    ).actions,
  ).toEqual([])
})
