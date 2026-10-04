import type {
  contract,
  OutputOf,
  StatementDetail,
  StatementDraft,
  ReceiptDetail,
  PartyLedger,
  AfterDetail,
} from '@huazhong/shared'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { dataOf, idBy, startSales, TODAY, TOMORROW, type SalesApp } from './support/sales.ts'
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
async function detail() {
  return dataOf<StatementDetail>(await (await s.as('u6')).get(`/finance/statements/${statementId}`))
}
async function ledger() {
  return dataOf<PartyLedger>(await (await s.as('u6')).get(`/finance/customers/${customerId}`))
}
function receiptInput(
  amountCents: number,
  statements: { id: string; version: number }[] = [],
  extra = {},
) {
  return {
    customerId,
    receiptDate: TODAY,
    amountCents,
    statements,
    methodName: '微信',
    note: '',
    discountCents: 0,
    discountReason: '',
    ...extra,
  }
}
async function draft(kind: 'customer' | 'supplier', partyId = customerId) {
  return dataOf<StatementDraft>(
    await (await s.as('u6')).get(`/finance/statements/draft?kind=${kind}&partyId=${partyId}`),
  )
}
async function create(input: StatementDraft, sources = input.sources) {
  const finance = await s.as('u6')
  return dataOf<StatementDetail>(
    await finance.post('/finance/statements', {
      kind: input.kind,
      partyId: input.partyId,
      partyVersion: input.partyVersion,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      note: '',
      creditCents: input.creditCents,
      sources,
    }),
  )
}
async function voidStatement(d: StatementDetail) {
  const finance = await s.as('u6')
  return dataOf<StatementDetail>(
    await finance.post(`/finance/statements/${d.id}/void`, {
      version: d.version,
      reason: '登记错误',
    }),
  )
}

test('D01 新种子使用整张DZ，首页只算已开对账单，门店只见本店金额', async () => {
  expect(await detail()).toMatchObject({
    no: 'DZ-260929-001',
    grossCents: 358800,
    dueCents: 358800,
    creditDeductedCents: 0,
    status: 'unsettled',
    sourceCount: 2,
    dueDate: '2026-10-29',
  })
  expect(await ledger()).toMatchObject({
    unsettledCents: 358800,
    outstandingCents: 358800,
    creditCents: 0,
  })
  const finance = await s.as('u6')
  const todos = dataOf<OutputOf<typeof contract.moduleTodos>>(
    await finance.get('/modules/finance/todos'),
  )
  // 角标 = 待收款 + 待付款张数，逾期未收已含在待收款里，不重复计
  expect(todos.count).toBe(1)
  const unsettled = dataOf<OutputOf<typeof contract.listArCustomers>>(
    await finance.get('/finance/customers?filter=unsettled'),
  )
  expect(unsettled.items.map((item) => item.partyName)).toEqual(['晨曦花艺'])
  expect(todos.rows).toEqual([
    { key: 'receivable', label: '待收款', count: 1, amountCents: 358800 },
    { key: 'overdueReceivable', label: '逾期未收', count: 0 },
    { key: 'payable', label: '待付款', count: 0, amountCents: 0 },
  ])
  const page = dataOf<OutputOf<typeof contract.storeStatements>>(
    await (await s.as('s1')).get('/store/statements'),
  )
  expect(page).toMatchObject({
    unsettledCents: 148800,
    unstatementedCents: 0,
    items: [{ id: statementId, storeAmountCents: 148800, sourceCount: 1 }],
  })
  const storeDetail = dataOf<OutputOf<typeof contract.storeStatementDetail>>(
    await (await s.as('s1')).get(`/store/statements/${statementId}`),
  )
  expect(storeDetail.groups.flatMap((g) => g.sources).map((item) => item.sourceNo)).toEqual([
    'SO-260927-021',
  ])
  expect(storeDetail).not.toHaveProperty('settlements')
  expect(storeDetail).not.toHaveProperty('openingDebtCents')
  expect(storeDetail.actions).toEqual([])
  const other = await idBy(s.t, 'statements.no', 'DZ-260929-002')
  expect((await (await s.as('s1')).get(`/store/statements/${other}`)).status).toBe(404)
})

test('D02–D07 足额或优惠整张结清，作废收款恢复未结清，再作废DZ释放来源', async () => {
  const finance = await s.as('u6'),
    d = await detail()
  const registered = dataOf<ReceiptDetail>(
    await finance.post(
      '/finance/receipts',
      receiptInput(360000, [{ id: d.id, version: d.version }], {
        discountCents: 1000,
        discountReason: '抹零',
      }),
    ),
  )
  expect(registered).toMatchObject({
    creditCents: 2200,
    creditBalanceCents: 2200,
    discountCents: 1000,
    statements: [
      {
        id: d.id,
        amountCents: 358800,
        status: 'settled',
        periodFrom: d.periodFrom,
        periodTo: d.periodTo,
      },
    ],
  })
  // 已收只算实际收到的钱，优惠单列，不能把优惠算成已收
  expect(await detail()).toMatchObject({
    status: 'settled',
    settledCents: 357800,
    settledDiscountCents: 1000,
    settlements: [{ amountCents: 360000, discountCents: 1000, creditCents: 2200 }],
  })
  expect(
    (
      await finance.post(`/finance/statements/${d.id}/void`, {
        version: (await detail()).version,
        reason: '错',
      })
    ).body.error?.code,
  ).toBe('BUSINESS_RULE')
  dataOf(
    await finance.post(`/finance/receipts/${registered.id}/void`, {
      version: registered.version,
      reason: '错',
    }),
  )
  const restored = await detail()
  expect(restored).toMatchObject({
    status: 'unsettled',
    settledAt: null,
    settlements: [{ status: 'voided' }],
  })
  await voidStatement(restored)
  expect(
    (await draft('customer')).sources
      .filter((item) => item.carriesAmount)
      .map((item) => item.sourceNo)
      .sort(),
  ).toEqual(['SO-260927-021', 'SO-260927-026'])
  expect(
    dataOf<OutputOf<typeof contract.storeStatements>>(
      await (await s.as('s1')).get('/store/statements'),
    ).items,
  ).toEqual([])
  expect((await (await s.as('s1')).get(`/store/statements/${d.id}`)).status).toBe(404)
})

test('D08 少收、超额优惠、未勾优惠、未来日期均拒绝，无部分结清', async () => {
  const finance = await s.as('u6'),
    d = await detail(),
    selected = [{ id: d.id, version: d.version }]
  const short = await finance.post('/finance/receipts', receiptInput(100, selected))
  expect(short.body.error?.code).toBe('BUSINESS_RULE')
  expect(short.body.error?.message).toContain('还差')
  expect(
    (
      await finance.post(
        '/finance/receipts',
        receiptInput(100, selected, { discountCents: 358801, discountReason: '错' }),
      )
    ).body.error?.fields,
  ).toHaveProperty('discountCents')
  expect(
    (
      await finance.post(
        '/finance/receipts',
        receiptInput(100, [], { discountCents: 1, discountReason: '错' }),
      )
    ).body.error?.fields,
  ).toHaveProperty('discountCents')
  expect(
    (await finance.post('/finance/receipts', receiptInput(100, [], { receiptDate: TOMORROW }))).body
      .error?.fields,
  ).toHaveProperty('receiptDate')
  expect(await detail()).toMatchObject({ version: d.version, status: 'unsettled' })
  const foreign = await idBy(s.t, 'statements.no', 'DZ-260929-002')
  expect(
    (await finance.post('/finance/receipts', receiptInput(100000, [{ id: foreign, version: 1 }])))
      .body.error?.code,
  ).toBe('NOT_FOUND')
})

test('D09 一张不勾整笔多收，开单自动抵；后续DZ作废才可作废来源收款', async () => {
  const finance = await s.as('u6')
  await voidStatement(await detail())
  const money = dataOf<ReceiptDetail>(await finance.post('/finance/receipts', receiptInput(10000)))
  expect(money.creditCents).toBe(10000)
  const next = await create(await draft('customer'))
  expect(next).toMatchObject({ grossCents: 358800, creditDeductedCents: 10000, dueCents: 348800 })
  const blocked = await finance.post(`/finance/receipts/${money.id}/void`, {
    version: money.version,
    reason: '错',
  })
  expect(blocked.body.error?.code).toBe('BUSINESS_RULE')
  expect(blocked.body.error?.message).toContain(next.no)
  await voidStatement(next)
  expect(
    dataOf<ReceiptDetail>(await finance.get(`/finance/receipts/${money.id}`)).creditBalanceCents,
  ).toBe(10000)
  expect(
    (
      await finance.post(`/finance/receipts/${money.id}/void`, {
        version: money.version,
        reason: '错',
      })
    ).status,
  ).toBe(200)
})

test('D10 处理完售后进下一张，负额DZ生成余额；余额退款释放后可作废', async () => {
  const finance = await s.as('u6'),
    sales = await s.as('u2'),
    afterId = await idBy(s.t, 'afters.no', 'AS-260929-003')
  const after = dataOf<AfterDetail>(await sales.get(`/afters/${afterId}`))
  dataOf(
    await sales.post(`/afters/${afterId}/process`, {
      version: after.version,
      note: '',
      lines: after.lines.map((line) => ({
        id: line.id,
        qty: line.requestedQty ?? line.qty,
        priceCents: 6800,
      })),
    }),
  )
  expect(await detail()).toMatchObject({ dueCents: 358800 })
  const d = await create(await draft('customer'))
  expect(d.status).toBe('settled')
  expect(d.dueCents).toBe(0)
  expect(d.creditGeneratedCents).toBeGreaterThan(0)
  const refund = dataOf<OutputOf<typeof contract.createRefund>>(
    await finance.post('/finance/refunds', {
      kind: 'receipt',
      customerId,
      refundDate: TODAY,
      amountCents: d.creditGeneratedCents,
      methodName: '微信',
      note: '',
    }),
  )
  expect(refund.sources).toEqual([
    { type: 'statement', id: d.id, no: d.no, amountCents: d.creditGeneratedCents },
  ])
  expect(
    (await finance.post(`/finance/statements/${d.id}/void`, { version: d.version, reason: '错' }))
      .body.error?.code,
  ).toBe('BUSINESS_RULE')
  dataOf(
    await finance.post(`/finance/refunds/${refund.id}/void`, {
      version: refund.version,
      reason: '错',
    }),
  )
  await voidStatement(d)
  const history = await ledger()
  expect(history.refunds[0]?.sources[0]?.no).toBe(d.no)
})

test('D11 开首单后期初设置永久锁，首单作废重新待入单；账期快照与逾期', async () => {
  const finance = await s.as('u6'),
    partyId = await idBy(s.t, 'suppliers.name', '云岭花卉')
  const terms = dataOf<OutputOf<typeof contract.supplierTerms>>(
    await finance.get(`/finance/suppliers/${partyId}/terms`),
  )
  const updated = dataOf<OutputOf<typeof contract.supplierTerms>>(
    await finance.patch(`/finance/suppliers/${partyId}/terms`, {
      version: terms.version,
      termDays: 1,
      openingDebtCents: 1000,
    }),
  )
  expect(updated.openingDebtEditable).toBe(true)
  const d = await create(await draft('supplier', partyId))
  expect(d).toMatchObject({
    grossCents: 96000,
    openingDebtCents: 1000,
    dueCents: 97000,
    dueDate: TOMORROW,
  })
  const now = dataOf<OutputOf<typeof contract.supplierTerms>>(
    await finance.get(`/finance/suppliers/${partyId}/terms`),
  )
  expect(now.openingDebtEditable).toBe(false)
  expect(
    (
      await finance.patch(`/finance/suppliers/${partyId}/terms`, {
        version: now.version,
        termDays: 30,
        openingDebtCents: 1,
      })
    ).body.error?.code,
  ).toBe('BUSINESS_RULE')
  dataOf(
    await finance.patch(`/finance/suppliers/${partyId}/terms`, {
      version: now.version,
      termDays: 30,
    }),
  )
  expect(dataOf<StatementDetail>(await finance.get(`/finance/statements/${d.id}`)).dueDate).toBe(
    TOMORROW,
  )
  s.clock.set('2026-10-01T02:00:00.000Z')
  expect(
    dataOf<StatementDetail>(await finance.get(`/finance/statements/${d.id}`)).overdueDays,
  ).toBe(1)
  await voidStatement(d)
  expect((await draft('supplier', partyId)).openingDebtCents).toBe(1000)
  // 首单作废后没有未作废的对账单，期初欠款可以再改
  expect(
    dataOf<OutputOf<typeof contract.supplierTerms>>(
      await finance.get(`/finance/suppliers/${partyId}/terms`),
    ).openingDebtEditable,
  ).toBe(true)
})

test('D12 外部状态日期筛选只影响列表，抬头总账不变；share含整单', async () => {
  const store = await s.as('s1')
  const filtered = dataOf<OutputOf<typeof contract.storeStatements>>(
    await store.get('/store/statements?status=settled&from=2000-01-01&to=2000-01-01'),
  )
  expect(filtered.items).toEqual([])
  expect(filtered.unsettledCents).toBe(148800)
  const share = dataOf<OutputOf<typeof contract.shareStatement>>(
    await (await s.as('u6')).post(`/finance/statements/${statementId}/share`),
  )
  expect(share.shareData.groups).toHaveLength(2)
  expect(share.shareData).not.toHaveProperty('actions')
  expect(share.generatedAt).toBeTruthy()
})

test('D13 别家来源不存在；同一家金额或版本变化STALE', async () => {
  const finance = await s.as('u6'),
    foreign = await idBy(s.t, 'orders.no', 'SO-260928-030')
  await voidStatement(await detail())
  const d = await draft('customer')
  const input = {
    kind: 'customer',
    partyId: customerId,
    partyVersion: d.partyVersion,
    periodFrom: d.periodFrom,
    periodTo: d.periodTo,
    note: '',
    creditCents: d.creditCents,
  }
  expect(
    (
      await finance.post('/finance/statements', {
        ...input,
        sources: [{ type: 'order', id: foreign, version: 1, amountCents: 93600 }],
      })
    ).body.error?.code,
  ).toBe('NOT_FOUND')
  expect(
    (
      await finance.post('/finance/statements', {
        ...input,
        sources: d.sources.map((source) => ({ ...source, amountCents: source.amountCents + 1 })),
      })
    ).body.error?.code,
  ).toBe('STALE')
})
