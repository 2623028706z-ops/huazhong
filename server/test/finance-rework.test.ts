import { randomUUID } from 'node:crypto'
import type {
  contract,
  OutputOf,
  StatementDraft,
  StatementDetail,
  ReceiptDetail,
  PaymentDetail,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  accounts,
  accountModules,
  operationLogs,
  receipts,
  payments,
  statements,
} from '../db/schema/index.ts'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { call } from './support/http.ts'
import { found } from '../src/common/scope.ts'
let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
type Kind = 'receipt' | 'payment'
type Money = ReceiptDetail | PaymentDetail
async function subject(kind: Kind) {
  return kind === 'receipt'
    ? { customerId: await idBy(s.t, 'customers.name', '晨曦花艺') }
    : { supplierId: await idBy(s.t, 'suppliers.name', '云岭花卉') }
}
async function input(
  kind: Kind,
  amountCents = 10000,
  selected: { id: string; version: number }[] = [],
) {
  return {
    ...(await subject(kind)),
    ...(kind === 'receipt' ? { receiptDate: TODAY } : { payDate: TODAY }),
    amountCents,
    discountCents: 0,
    discountReason: '',
    statements: selected,
    methodName: '微信',
    note: '',
  }
}
async function register(kind: Kind, amountCents = 10000) {
  return dataOf<Money>(
    await (await s.as('u6')).post(`/finance/${kind}s`, await input(kind, amountCents)),
  )
}
async function refundInput(kind: Kind, amountCents: number) {
  return {
    ...(await subject(kind)),
    kind,
    refundDate: TODAY,
    amountCents,
    methodName: '微信',
    note: '',
  }
}
async function read(kind: Kind, id: string) {
  return dataOf<Money>(await (await s.as('u6')).get(`/finance/${kind}s/${id}`))
}
async function secondFinance() {
  const api = await s.as('u2')
  const row = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, api.openid)))[0],
  )
  await s.t.db.insert(accountModules).values({ accountId: row.id, module: 'finance' })
  return api
}

test.each(['receipt', 'payment'] as const)(
  'D15 %s退款归属、并发作废只成功一次，历史来源单号保留',
  async (kind) => {
    const finance = await s.as('u6'),
      other = await secondFinance(),
      admin = await s.as('u1'),
      money = await register(kind)
    const refund = dataOf<OutputOf<typeof contract.createRefund>>(
      await finance.post('/finance/refunds', await refundInput(kind, 4000)),
    )
    expect(
      (
        await other.post(`/finance/${kind}s/${money.id}/void`, {
          version: money.version,
          reason: '错',
        })
      ).body.error?.code,
    ).toBe('FORBIDDEN')
    expect(
      (
        await finance.post(`/finance/${kind}s/${money.id}/void`, {
          version: money.version,
          reason: '错',
        })
      ).body.error?.code,
    ).toBe('BUSINESS_RULE')
    expect(
      (
        await other.post(`/finance/refunds/${refund.id}/void`, {
          version: refund.version,
          reason: '错',
        })
      ).body.error?.code,
    ).toBe('FORBIDDEN')
    const results = await Promise.all(
      [finance, admin].map((api) =>
        api.post(`/finance/refunds/${refund.id}/void`, { version: refund.version, reason: '错' }),
      ),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(results.find((r) => r.status === 409)?.body.error?.code).toBe('STALE')
    expect(await read(kind, money.id)).toMatchObject({
      creditBalanceCents: 10000,
      refunds: [{ status: 'voided', sources: [{ no: money.no, amountCents: 4000 }] }],
    })
    dataOf(
      await finance.post(`/finance/${kind}s/${money.id}/void`, {
        version: money.version,
        reason: '错',
      }),
    )
    expect((await read(kind, money.id)).refunds[0]?.sources[0]?.no).toBe(money.no)
  },
)

test.each(['receipt', 'payment'] as const)(
  'D23 %s并发退款不能超余额，失败无日志/部分入账',
  async (kind) => {
    const finance = await s.as('u6'),
      money = await register(kind),
      before = (await s.t.db.select().from(operationLogs)).length
    const body = await refundInput(kind, 7000)
    const results = await Promise.all([
      finance.post('/finance/refunds', body),
      finance.post('/finance/refunds', body),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await read(kind, money.id)).toMatchObject({
      creditBalanceCents: 3000,
      refunds: [{ amountCents: 7000 }],
    })
    expect((await s.t.db.select().from(operationLogs)).length).toBe(before + 1)
  },
)

test.each(['receipt', 'payment'] as const)(
  'D24 %s退款按来源余额追溯，先来的先用，幂等不重复资金',
  async (kind) => {
    const finance = await s.as('u6'),
      first = await register(kind, 4000),
      second = await register(kind, 6000)
    const body = await refundInput(kind, 7000),
      key = randomUUID()
    const post = () =>
      call(s.t, 'POST', '/finance/refunds', { openid: finance.openid, body, idempotencyKey: key })
    const r = dataOf<OutputOf<typeof contract.createRefund>>(await post())
    expect(r.sources).toEqual([
      { type: kind, id: first.id, no: first.no, amountCents: 4000 },
      { type: kind, id: second.id, no: second.no, amountCents: 3000 },
    ])
    expect(dataOf<OutputOf<typeof contract.createRefund>>(await post()).id).toBe(r.id)
    expect((await read(kind, second.id)).creditBalanceCents).toBe(3000)
    const fundBody = await input(kind, 1000),
      fundKey = randomUUID(),
      fundPost = () =>
        call(s.t, 'POST', `/finance/${kind}s`, {
          openid: finance.openid,
          body: fundBody,
          idempotencyKey: fundKey,
        })
    const f = dataOf<Money>(await fundPost())
    expect(dataOf<Money>(await fundPost()).id).toBe(f.id)
    expect(
      (await s.t.db.select().from(kind === 'receipt' ? receipts : payments)).filter(
        (row) => row.id === Number(f.id),
      ),
    ).toHaveLength(1)
  },
)

test('D25 同一DZ两笔并发收款只成功一次，没有部分结清', async () => {
  const finance = await s.as('u6'),
    id = await idBy(s.t, 'statements.no', 'DZ-260929-001'),
    body = await input('receipt', 358800, [{ id, version: 1 }])
  const before = (await s.t.db.select().from(operationLogs)).length
  const results = await Promise.all([
    finance.post('/finance/receipts', body),
    finance.post('/finance/receipts', body),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  expect(results.find((r) => r.status === 409)?.body.error?.code).toBe('STALE')
  expect(
    (
      await s.t.db
        .select()
        .from(statements)
        .where(eq(statements.id, Number(id)))
    )[0]?.status,
  ).toBe('settled')
  expect((await s.t.db.select().from(operationLogs)).length).toBe(before + 1)
})

test('D26 同来源并发开DZ只生成一次，credit快照变化拒绝过期申请', async () => {
  const finance = await s.as('u6'),
    partyId = found((await subject('payment')).supplierId)
  const draft = dataOf<StatementDraft>(
    await finance.get(`/finance/statements/draft?kind=supplier&partyId=${partyId}`),
  )
  const body = {
    kind: 'supplier',
    partyId,
    partyVersion: draft.partyVersion,
    periodFrom: draft.periodFrom,
    periodTo: draft.periodTo,
    creditCents: draft.creditCents,
    note: '',
    sources: draft.sources,
  }
  const results = await Promise.all([
    finance.post('/finance/statements', body),
    finance.post('/finance/statements', body),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  expect(results.find((r) => r.status === 409)?.body.error?.code).toBe('STALE')
  const created = dataOf<StatementDetail>(found(results.find((r) => r.status === 200)))
  dataOf(
    await finance.post(`/finance/statements/${created.id}/void`, {
      version: created.version,
      reason: '错',
    }),
  )
  await register('payment')
  expect((await finance.post('/finance/statements', body)).body.error?.code).toBe('STALE')
})
