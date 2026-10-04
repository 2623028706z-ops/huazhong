import {
  type contract,
  copy,
  type OutputOf,
  type PoDetail,
  type PaymentDetail,
  type Supplier,
  type Me,
  WS_CLOSE,
} from '@huazhong/shared'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  createPo,
  payInput,
  poInput,
  poOf,
  receiveInput,
  supplierInput,
  supplierOf,
  inviteOf,
} from './support/purchase.ts'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})

test('D09 付款状态数量只按日期统计，状态筛选和分页不改变，收款不串用', async () => {
  const warehouse = await s.as('u5')
  const finance = await s.as('u6')
  const source = await createPo(s)
  const firstPo = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${source.id}/receive`, receiveInput(source)),
  )
  const first = dataOf<PaymentDetail>(
    await finance.post('/finance/payments', await payInput(s, firstPo)),
  )
  const secondSource = await createPo(s)
  const secondPo = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${secondSource.id}/receive`, receiveInput(secondSource)),
  )
  dataOf(await finance.post('/finance/payments', await payInput(s, secondPo)))
  dataOf(
    await finance.post(`/finance/payments/${first.id}/void`, {
      version: first.version,
      reason: '重复登记',
    }),
  )
  const endpoint = `/finance/records?kind=payment&from=${TODAY}&to=${TODAY}`
  const filtered = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get(`${endpoint}&status=valid&limit=1`),
  )
  expect(filtered.items).toHaveLength(1)
  // 收付款状态不是等待类，counts 恒为 {}（05 章第 1.3 节）
  expect(filtered.counts).toEqual({})
  const firstPage = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get(`${endpoint}&limit=1`),
  )
  expect(firstPage.counts).toEqual(filtered.counts)
  const secondPage = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get(
      `${endpoint}&limit=1&cursor=${encodeURIComponent(firstPage.nextCursor ?? '')}`,
    ),
  )
  expect(secondPage.counts).toEqual(filtered.counts)
  expect(
    dataOf<OutputOf<typeof contract.listFinanceRecords>>(
      await finance.get('/finance/records?kind=payment&from=2026-09-28&to=2026-09-28'),
    ).counts,
  ).toEqual({})
  const receipts = dataOf<OutputOf<typeof contract.listFinanceRecords>>(
    await finance.get('/finance/records?kind=receipt'),
  )
  expect(receipts.counts).toEqual({})
  expect(receipts.items.some((item) => 'docType' in item)).toBe(false)
})
afterEach(async () => {
  await s.close()
})

test('B02–B09 完整采购、少收链路三家应付和模块日志一致', async () => {
  const purchase = await s.as('u4'),
    wh = await s.as('u5'),
    finance = await s.as('u6')
  const po = await createPo(s, {
    supplierId: await idBy(s.t, 'suppliers.name', '滇花源'),
    lines: [
      { materialId: await idBy(s.t, 'materials.name', '白玫瑰'), qty: 60, priceCents: 900 },
      { materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 50, priceCents: 500 },
    ],
  })
  const supplier = await supplierOf(s, '滇花源')
  dataOf(
    await purchase.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(supplier),
      enabled: false,
    }),
  )
  dataOf(await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(po)))
  const spring = await poOf(s, 'PO-260929-006')
  const edited = dataOf<PoDetail>(
    await purchase.put(`/purchase-orders/${spring.id}`, {
      ...poInput(spring),
      lines: poInput(spring).lines.map((l) => ({ ...l, qty: 180 })),
      reason: '供应商只能供 180 枝',
    }),
  )
  dataOf(
    await wh.post(`/purchase-orders/${spring.id}/receive`, {
      ...receiveInput(edited),
      lines: receiveInput(edited).lines.map((l) => ({ ...l, receivedQty: 170 })),
    }),
  )
  const suppliers = dataOf<OutputOf<typeof contract.listFinanceSuppliers>>(
    await finance.get('/finance/suppliers'),
  )
  expect(suppliers.items.map((row) => [row.partyName, row.unstatementedCents])).toEqual(
    expect.arrayContaining([
      ['春禾花材', 241400],
      ['云岭花卉', 96000],
      ['滇花源', 79000],
    ]),
  )
  const payable = dataOf<OutputOf<typeof contract.getFinancePurchaseOrder>>(
    await finance.get(`/finance/purchase-orders/${spring.id}`),
  )
  expect(payable).toMatchObject({
    amountCents: 241400,
    statement: null,
    lines: [{ qty: 180, receivedQty: 170 }],
  })
  const extra = await createPo(s)
  dataOf(
    await purchase.post(`/purchase-orders/${extra.id}/cancel`, {
      version: extra.version,
      reason: '活动取消',
    }),
  )
  dataOf<Supplier>(
    await purchase.post('/suppliers', {
      name: '青禾鲜切',
      contact: '',
      phone: '',
      address: '',
      enabled: true,
      account: { enabled: false, loginPhone: '' },
    }),
  )
  const logs = dataOf<OutputOf<typeof contract.listLogs>>(await (await s.as('u1')).get('/logs'))
  expect(logs.items.map((l) => l.action)).toEqual(
    expect.arrayContaining([
      copy.log.action.createPurchaseOrder,
      copy.log.action.updatePurchaseOrder,
      copy.log.action.cancelPurchaseOrder,
      copy.log.action.createSupplier,
      copy.log.action.disableSupplier,
      copy.log.action.receivePurchaseOrder,
    ]),
  )
})

test('D10 D11 收付款方式停用后不改历史记录、不能再付款，付款日志可见', async () => {
  const finance = await s.as('u6'),
    po = await poOf(s, 'PO-260928-004')
  const input = await payInput(s, po)
  const payment = dataOf<PaymentDetail>(await finance.post('/finance/payments', input))
  const methods = dataOf<OutputOf<typeof contract.listMethods>>(
    await finance.get('/finance/methods'),
  )
  const method = methods.items.find((m) => m.name === '微信')
  dataOf(await finance.patch(`/finance/methods/${method?.id}`, { enabled: false }))
  expect(
    dataOf<PaymentDetail>(await finance.get(`/finance/payments/${payment.id}`)).methodName,
  ).toBe('微信')
  dataOf(
    await finance.post(`/finance/payments/${payment.id}/void`, {
      version: payment.version,
      reason: '付错供应商账户',
    }),
  )
  expect((await finance.post('/finance/payments', input)).body.error).toMatchObject({
    code: 'BUSINESS_RULE',
    message: copy.finance.methodDisabled,
  })
  const logs = dataOf<OutputOf<typeof contract.listLogs>>(await finance.get('/logs?module=finance'))
  expect(logs.items.map((l) => l.action)).toEqual(
    expect.arrayContaining([copy.log.action.registerPayment, copy.log.action.voidPayment]),
  )
})

test('F05 停用供应商保留绑定、取消邀请、旧单可收货，重新启用恢复登录', async () => {
  const purchase = await s.as('u4'),
    external = await s.as('p1'),
    supplier = await supplierOf(s)
  const ws = await connect(s.t, external.openid)
  const disabled = dataOf<Supplier>(
    await purchase.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(supplier),
      enabled: false,
    }),
  )
  expect(disabled.account).toEqual(supplier.account)
  expect(await ws.closed).toBe(WS_CLOSE.accountDisabled)
  expect((await external.get('/me')).body.error?.code).toBe('ACCOUNT_DISABLED')
  expect((await external.get('/supplier/invites')).body.error?.code).toBe('ACCOUNT_DISABLED')
  expect(await inviteOf(s)).toMatchObject({
    status: 'cancelled',
    cancelNote: '停用供应商，自动取消',
  })
  const po = await poOf(s, 'PO-260929-006')
  expect(
    dataOf<PoDetail>(
      await (await s.as('u5')).post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
    ).status,
  ).toBe('received')
  dataOf(
    await purchase.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(disabled),
      enabled: true,
    }),
  )
  expect(dataOf<Me>(await external.get('/me'))).toMatchObject({
    id: supplier.account.id,
    landing: 'supplier_invites',
  })
  const restored = await connect(s.t, external.openid)
  await restored.sync()
  restored.close()
  expect((await inviteOf(s)).status).toBe('cancelled')
})
