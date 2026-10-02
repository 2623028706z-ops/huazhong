import { found } from '../src/common/scope.ts'
import { randomUUID } from 'node:crypto'
import {
  type contract,
  copy,
  type OutputOf,
  type PaymentDetail,
  type ReceiptDetail,
  type PoDetail,
} from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  accounts,
  accountModules,
  allocations,
  operationLogs,
  paymentAllocations,
  payments,
  receipts,
} from '../db/schema/index.ts'
import { call } from './support/http.ts'
import { createPo, poOf, receiveInput } from './support/purchase.ts'
import {
  dataOf,
  idBy,
  snapshotInput,
  startSales,
  TODAY,
  type Api,
  type SalesApp,
} from './support/sales.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
type Kind = 'receipt' | 'payment'
type Money = ReceiptDetail | PaymentDetail

async function secondFinance() {
  const api = await s.as('u2')
  const row = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, api.openid)))[0],
  )
  await s.t.db.insert(accountModules).values({ accountId: row.id, module: 'finance' })
  return api
}
async function subject(kind: Kind) {
  return kind === 'receipt'
    ? { customerId: await idBy(s.t, 'customers.name', '晨曦花艺') }
    : { supplierId: await idBy(s.t, 'suppliers.name', '云岭花卉') }
}
async function document(kind: Kind) {
  return kind === 'receipt'
    ? { orderId: await idBy(s.t, 'orders.no', 'SO-260927-026') }
    : { docType: 'po' as const, docId: await idBy(s.t, 'purchase_orders.no', 'PO-260928-004') }
}
async function register(kind: Kind, amountCents: number, allocs: unknown[] = [], date = TODAY) {
  const finance = await s.as('u6')
  return dataOf<Money>(
    await finance.post(`/finance/${kind}s`, {
      ...(await subject(kind)),
      ...(kind === 'receipt' ? { receiptDate: date } : { payDate: date }),
      amountCents,
      allocs,
      methodName: '微信',
      note: '',
    }),
  )
}
async function read(kind: Kind, id: string, api?: Api) {
  return dataOf<Money>(await (api ?? (await s.as('u6'))).get(`/finance/${kind}s/${id}`))
}
async function allocate(kind: Kind, api: Api, amountCents: number) {
  return api.post(
    kind === 'receipt' ? '/finance/prepaid-allocations' : '/finance/prepaid-payment-allocations',
    {
      ...(await subject(kind)),
      allocs: [{ ...(await document(kind)), amountCents }],
    },
  )
}
function refundInput(kind: Kind, money: Money, amountCents: number) {
  return {
    kind,
    ...(kind === 'receipt' ? { receiptId: money.id } : { paymentId: money.id }),
    amountCents,
    refundDate: TODAY,
    methodName: '微信',
    note: '',
  }
}
function revokePath(kind: Kind, id: string) {
  return `/finance/${kind === 'receipt' ? 'allocations' : 'payment-allocations'}/${id}/revoke`
}

test.each(['receipt', 'payment'] as const)(
  'D15 D24 D26 %s 作废归属先于有效退款业务阻挡，退款版本竞争只成功一次',
  async (kind) => {
    const finance = await s.as('u6'),
      other = await secondFinance(),
      admin = await s.as('u1')
    const money = await register(kind, 10000)
    const refund = dataOf<OutputOf<typeof contract.createRefund>>(
      await finance.post('/finance/refunds', refundInput(kind, money, 4000)),
    )
    const forbidden = await other.post(`/finance/${kind}s/${money.id}/void`, {
      version: money.version,
      reason: '无归属',
    })
    expect(forbidden).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    const blocked = await finance.post(`/finance/${kind}s/${money.id}/void`, {
      version: money.version,
      reason: '登记错误',
    })
    expect(blocked).toMatchObject({
      status: 409,
      body: {
        error: {
          code: 'BUSINESS_RULE',
          message:
            kind === 'receipt' ? copy.rework.receiptVoidLocked : copy.rework.paymentVoidLocked,
        },
      },
    })
    expect(
      await other.post(`/finance/refunds/${refund.id}/void`, {
        version: refund.version,
        reason: '无归属',
      }),
    ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    const results = await Promise.all(
      [finance, admin].map((api) =>
        api.post(`/finance/refunds/${refund.id}/void`, {
          version: refund.version,
          reason: '退款错误',
        }),
      ),
    )
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(results.find((result) => result.status === 409)?.body.error?.code).toBe('STALE')
    const restored = await read(kind, money.id)
    expect(restored).toMatchObject({
      prepaidCents: 10000,
      refunds: [{ amountCents: 4000, status: 'voided', voidReason: '退款错误', actions: [] }],
    })
    expect(restored.refunds[0]?.voidedAt).toBeTruthy()
    expect(restored.refunds[0]?.voidedBy).toBeTruthy()
    expect(
      (
        await finance.post(`/finance/${kind}s/${money.id}/void`, {
          version: money.version,
          reason: '登记错误',
        })
      ).status,
    ).toBe(200)
  },
)

test.each(['receipt', 'payment'] as const)(
  'D24 %s 单条撤回归核销登记人，资金作废不覆盖已撤回元数据',
  async (kind) => {
    const finance = await s.as('u6'),
      other = await secondFinance()
    const money = await register(kind, 10000)
    dataOf(await allocate(kind, other, 5000))
    const allocation = found((await read(kind, money.id)).allocations[0])
    expect(
      await finance.post(revokePath(kind, allocation.id), { reason: '资金登记人越权' }),
    ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
    const revoked = dataOf<Money>(
      await other.post(revokePath(kind, allocation.id), { reason: '核销错误' }),
    )
    expect(revoked.allocations[0]).toMatchObject({
      status: 'revoked',
      registeredCents: 5000,
      effectiveCents: 0,
      revokeReason: '核销错误',
    })
    const historical = revoked.allocations[0]
    const voided = dataOf<Money>(
      await finance.post(`/finance/${kind}s/${money.id}/void`, {
        version: money.version,
        reason: '资金错误',
      }),
    )
    expect(voided.allocations[0]).toEqual(historical)
  },
)

test.each(['receipt', 'payment'] as const)(
  'D23 %s 同笔余额并发退款不能超退，失败无日志或部分写入',
  async (kind) => {
    const finance = await s.as('u6'),
      money = await register(kind, 10000)
    const logCount = (await s.t.db.select().from(operationLogs)).length
    const results = await Promise.all(
      [7000, 7000].map((amount) =>
        finance.post('/finance/refunds', refundInput(kind, money, amount)),
      ),
    )
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(await read(kind, money.id)).toMatchObject({
      prepaidCents: 3000,
      refunds: [{ amountCents: 7000 }],
    })
    expect(await s.t.db.select().from(operationLogs)).toHaveLength(logCount + 1)
  },
)

test.each(['receipt', 'payment'] as const)(
  'D27 %s 补录业务日期不改变资金登记及同时间ID取用顺序',
  async (kind) => {
    const finance = await s.as('u6'),
      first = await register(kind, 1000),
      second = await register(kind, 1000, [], '2026-09-20')
    const table = kind === 'receipt' ? receipts : payments
    await s.t.db
      .update(table)
      .set({ createdAt: new Date('2026-09-29T01:00:00Z') })
      .where(sql`${table.id} IN (${Number(first.id)}, ${Number(second.id)})`)
    dataOf(await allocate(kind, finance, 1500))
    expect(await read(kind, first.id)).toMatchObject({
      prepaidCents: 0,
      allocations: [{ kind: 'prepaid', registeredCents: 1000, effectiveCents: 1000 }],
    })
    expect(await read(kind, second.id)).toMatchObject({
      prepaidCents: 500,
      allocations: [{ kind: 'prepaid', registeredCents: 500, effectiveCents: 500 }],
    })
  },
)

test.each(['receipt', 'payment'] as const)(
  'D21 D22 %s 全账候选不可省略、跨主体不可核销，失败无资金核销日志',
  async (kind) => {
    const finance = await s.as('u6'),
      doc = await document(kind)
    const path = `/finance/${kind}s`
    const base = {
      ...(await subject(kind)),
      ...(kind === 'receipt' ? { receiptDate: TODAY } : { payDate: TODAY }),
      amountCents: 1000,
      allocs: [{ ...doc, amountCents: 1000 }],
      methodName: '微信',
      note: '',
    }
    const snapshot = (await snapshotInput(s.t, finance.openid, path, base)) as Record<
      string,
      unknown
    >
    const beforeLogs = (await s.t.db.select().from(operationLogs)).length
    expect((await finance.post(path, { ...snapshot, expected: [] })).body.error?.code).toBe('STALE')
    const foreign =
      kind === 'receipt'
        ? { orderId: await idBy(s.t, 'orders.no', 'SO-260928-030'), amountCents: 1000 }
        : {
            docType: 'po',
            docId: await idBy(s.t, 'purchase_orders.no', 'PO-260929-006'),
            amountCents: 1000,
          }
    expect(await finance.post(path, { ...snapshot, allocs: [foreign] })).toMatchObject({
      status: 404,
      body: { error: { code: 'NOT_FOUND' } },
    })
    expect(await s.t.db.select().from(operationLogs)).toHaveLength(beforeLogs)
    expect(await s.t.db.select().from(kind === 'receipt' ? receipts : payments)).toHaveLength(
      kind === 'receipt' ? 2 : 0,
    )
  },
)

test('D18 D20 H12 改价释放余额再核销，恢复价格使后单核销零生效仍有效且挡作废；跨单和付款推送', async () => {
  const finance = await s.as('u6'),
    wh = await s.as('u5'),
    first = await poOf(s, 'PO-260928-004')
  const second = await createPo(s, { supplierId: first.supplierId })
  dataOf(await wh.post(`/purchase-orders/${second.id}/receive`, receiveInput(second)))
  const money = await register('payment', 96000, [
    { docType: 'po', docId: first.id, amountCents: 96000 },
  ])
  const repriced = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${first.id}/reprice`, {
      version: first.version,
      reason: '优惠',
      lines: first.lines.map((line) => ({ poLineId: line.id, priceCents: 750 })),
    }),
  )
  dataOf(
    await finance.post('/finance/prepaid-payment-allocations', {
      supplierId: first.supplierId,
      allocs: [{ docType: 'po', docId: second.id, amountCents: 6000 }],
    }),
  )
  const socket = await connect(s.t, finance.openid)
  try {
    socket.send({ op: 'subscribe', topics: [`po:${second.id}`, `payment:${money.id}`] })
    await socket.sync()
    dataOf(
      await wh.post(`/purchase-orders/${first.id}/reprice`, {
        version: repriced.version,
        reason: '恢复',
        lines: first.lines.map((line) => ({ poLineId: line.id, priceCents: 800 })),
      }),
    )
    expect(
      await socket.next(
        (message) => message.op === 'changed' && message.topic === `po:${second.id}`,
      ),
    ).toMatchObject({ version: null })
    expect(
      await socket.next(
        (message) => message.op === 'changed' && message.topic === `payment:${money.id}`,
      ),
    ).toMatchObject({ version: null })
  } finally {
    socket.close()
  }
  const history = dataOf<PaymentDetail>(await finance.get(`/finance/payments/${money.id}`))
  expect(history.allocations[1]).toMatchObject({
    docId: second.id,
    registeredCents: 6000,
    effectiveCents: 0,
    status: 'valid',
  })
  const current = dataOf<PoDetail>(await wh.get(`/purchase-orders/${second.id}`))
  expect(
    await wh.post(`/purchase-orders/${second.id}/void`, {
      version: current.version,
      reason: '错误',
    }),
  ).toMatchObject({ status: 409, body: { error: { code: 'BUSINESS_RULE' } } })
  dataOf(
    await finance.post(revokePath('payment', found(history.allocations[1]).id), {
      reason: '撤回零生效核销',
    }),
  )
  expect(
    (
      await wh.post(`/purchase-orders/${second.id}/void`, {
        version: current.version,
        reason: '错误',
      })
    ).status,
  ).toBe(200)
})

test.each(['receipt', 'payment'] as const)(
  'D26 %s 退款成功幂等重放只读且不重复扣余额',
  async (kind) => {
    const finance = await s.as('u6'),
      money = await register(kind, 10000)
    const input = {
      openid: finance.openid,
      body: refundInput(kind, money, 2000),
      idempotencyKey: randomUUID(),
    }
    const first = dataOf(await call(s.t, 'POST', '/finance/refunds', input))
    const beforeLogs = (await s.t.db.select().from(operationLogs)).length
    expect(dataOf(await call(s.t, 'POST', '/finance/refunds', input))).toEqual(first)
    expect(await read(kind, money.id)).toMatchObject({ prepaidCents: 8000 })
    expect(await s.t.db.select().from(operationLogs)).toHaveLength(beforeLogs)
    expect(
      await s.t.db.select().from(kind === 'receipt' ? allocations : paymentAllocations),
    ).toHaveLength(kind === 'receipt' ? 2 : 0)
  },
)
