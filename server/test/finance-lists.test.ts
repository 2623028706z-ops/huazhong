import type { contract, OutputOf, StatementDetail } from '@huazhong/shared'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
let s: SalesApp
let customerId: string
let statementId: string
beforeEach(async () => {
  s = await startSales()
  customerId = await idBy(s.t, 'customers.name', '晨曦花艺')
  statementId = await idBy(s.t, 'statements.no', 'DZ-260929-001')
})
afterEach(async () => {
  await s.close()
})

test('D14 批量列表遵守往来/记录契约；内部只读DZ按岗位和kind授权', async () => {
  const finance = await s.as('u6')
  const sales = await s.as('u2')
  const parties = dataOf<OutputOf<typeof contract.listArCustomers>>(
    await finance.get('/finance/customers'),
  )
  expect(parties.items.find((p) => p.partyId === customerId)?.outstandingCents).toBe(358800)
  const records = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get('/finance/records'),
  )
  expect(records.items).toHaveLength(1)
  expect(records.items[0]?.creditCents).toBe(6400)
  const internal = dataOf<StatementDetail>(await sales.get(`/statements/${statementId}`))
  expect(internal.actions).toEqual([])
  expect(internal.no).toBe('DZ-260929-001')
  expect((await (await s.as('u4')).get(`/statements/${statementId}`)).status).toBe(404)
  expect((await (await s.as('u7')).get(`/statements/${statementId}`)).status).toBe(403)
  expect((await sales.post(`/finance/statements/${statementId}/share`)).status).toBe(403)
})
