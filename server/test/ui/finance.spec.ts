import {
  financeCopy as f,
  copy,
  type PoDetail,
  type PaymentDetail,
  type StatementDetail,
} from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { createPo, poOf, receiveInput } from '../support/purchase.ts'
import { dataOf, TODAY } from '../support/sales.ts'
import {
  asMini,
  enter,
  paymentInput,
  setupMiniSuite,
  snap,
  tapText,
  waitData,
  waitPage,
} from './mini.ts'

const suite = setupMiniSuite()

test('B16 H06 D08 整张DZ结清，多付草稿在往来变化后保留，作废付款恢复DZ', async () => {
  const { mini, server: s } = suite()
  const finance = await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  const input = await paymentInput(s, po)
  const selected = input.statements[0]
  if (!selected) throw new Error('no supplier statement')
  const ledger = await enter(mini, `/packages/finance/pages/supplier/index?id=${po.supplierId}`)
  await waitData(ledger, 'loaded', true)
  await ledger.callMethod('onRegister')
  const page = await waitPage(mini, 'packages/finance/pages/receive/index')
  await waitData(page, 'loaded', true)
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  // 从往来页进来，未结清对账单默认全勾上，金额预填合计（06 章付款页）
  expect(await page.data('rows.0.selected')).toBe(true)
  expect(await page.data('form.statements.0.id')).toBe(selected.id)
  expect(await page.data('form.amountText')).toBe('960.00')
  for (const [key, detail] of Object.entries({
    receiptDate: TODAY,
    amountText: '1020',
    methodName: '微信',
    note: '保留付款草稿',
  }))
    await page.callMethod('onField', { detail, currentTarget: { dataset: { key } } })
  dataOf(
    await finance.post('/finance/payments', {
      ...input,
      amountCents: 1000,
      statements: [],
      note: '新增多付往来',
    }),
  )
  await waitData(page, 'needsReview', true)
  expect(await page.data('form.amountText')).toBe('1020')
  expect(await page.data('form.statements.0.id')).toBe(selected.id)
  await page.callMethod('onReview')
  await waitData(page, 'needsReview', false)
  expect(await page.data('form.statements.0.dueCents')).toBe(96000)
  expect(await page.data('form.methodName')).toBe('微信')
  expect(await page.data('form.note')).toBe('保留付款草稿')
  await snap(mini, 'finance-payment-review')
  await page.callMethod('onSubmit')
  await waitPage(mini, 'packages/finance/pages/supplier/index')
  const records = dataOf<{ items: PaymentDetail[] }>(
    await finance.get('/finance/records?kind=payment'),
  )
  const payment = records.items.find((item) => item.note === '保留付款草稿')
  if (!payment) throw new Error('no payment')
  expect(payment.creditCents).toBe(6000)
  expect(payment.statements).toMatchObject([{ id: selected.id, amountCents: 96000 }])
  const settled = dataOf<StatementDetail>(await finance.get(`/finance/statements/${selected.id}`))
  expect(settled.status).toBe('settled')
  const recordPage = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(recordPage, 'loaded', true)
  await recordPage.callMethod('onKind', { detail: 'payment' })
  await expect.poll(async () => recordPage.data('rows') as Promise<unknown>).toHaveLength(2)
  await recordPage.callMethod('onOpen', { currentTarget: { dataset: { key: payment.id } } })
  const money = await waitPage(mini, 'packages/finance/pages/money/index')
  await waitData(money, 'loaded', true)
  expect(await money.data('view.statements.0.rows')).toHaveLength(1)
  await money.callMethod('onVoid')
  await money.callMethod('onSubmitVoid', { detail: '付错账户' })
  await waitData(money, 'view.status', 'voided')
  // 作废后仍列出原来结清的那张，置灰；对账单回到未结清
  expect(await money.data('view.statements.0.rows')).toMatchObject([
    { muted: true, tags: [{ text: f.unsettled, warn: true }] },
  ])
  expect(
    dataOf<StatementDetail>(await finance.get(`/finance/statements/${selected.id}`)).status,
  ).toBe('unsettled')
  await snap(mini, 'finance-payment-voided')
})

test('B17 对账单被作废后重新核对撤下选择，付款草稿可登记为多付', async () => {
  const { mini, server: s } = suite()
  const warehouse = await s.as('u5')
  const created = await createPo(s)
  const po = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${created.id}/receive`, receiveInput(created)),
  )
  const finance = await asMini(mini, s, 'u6')
  const input = await paymentInput(s, po)
  const selected = input.statements[0]
  if (!selected) throw new Error('no statement')
  // 付款页总是从别的页进来，登记完回上一页（这里是 F6 往来页）
  await enter(mini, `/packages/finance/pages/supplier/index?id=${po.supplierId}`)
  await mini.navigateTo(
    `/packages/finance/pages/receive/index?kind=payment&supplierId=${po.supplierId}&statementId=${selected.id}`,
  )
  const page = await waitPage(mini, 'packages/finance/pages/receive/index')
  await waitData(page, 'form.statements.0.id', selected.id)
  await page.callMethod('onField', {
    detail: TODAY,
    currentTarget: { dataset: { key: 'receiptDate' } },
  })
  await page.callMethod('onField', {
    detail: '210',
    currentTarget: { dataset: { key: 'amountText' } },
  })
  await page.callMethod('onField', {
    detail: '微信',
    currentTarget: { dataset: { key: 'methodName' } },
  })
  dataOf(
    await finance.post(`/finance/statements/${selected.id}/void`, {
      version: selected.version,
      reason: '重开对账',
    }),
  )
  const latest = await poOf(s, po.no)
  dataOf(
    await warehouse.post(`/purchase-orders/${po.id}/returns`, {
      version: latest.version,
      lines: latest.lines.map((line) => ({ poLineId: line.id, qty: line.receivedQty })),
    }),
  )
  await waitData(page, 'needsReview', true)
  await page.callMethod('onReview')
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toEqual([])
  expect(await page.data('form.statements')).toEqual([])
  expect(await page.data('form.amountText')).toBe('210')
  expect(await page.data('summary')).toEqual({
    due: '应付 ¥0.00',
    meta: '付款 + 优惠 ¥210.00\u3000多付 ¥210.00',
    short: false,
  })
  await snap(mini, 'finance-no-statement-credit-draft')
  await page.callMethod('onSubmit')
  await waitPage(mini, 'packages/finance/pages/supplier/index')
  const records = dataOf<{ items: PaymentDetail[] }>(
    await finance.get('/finance/records?kind=payment'),
  )
  expect(records.items[0]).toMatchObject({ creditCents: 21000, statements: [] })
})

test('D09 收付款标签切换、整页资金详情和状态日期筛选', async () => {
  const { mini, server: s } = suite()
  const finance = await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  const payment = dataOf<PaymentDetail>(
    await finance.post('/finance/payments', await paymentInput(s, po)),
  )
  const page = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('kind')).toBe('receipt')
  expect(await page.data('filter.picks')).toEqual({})
  await snap(mini, 'finance-records-receipt-tab')
  await page.callMethod('onKind', { detail: 'payment' })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  await snap(mini, 'finance-records-payment-tab')
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: payment.id } } })
  const money = await waitPage(mini, 'packages/finance/pages/money/index')
  await waitData(money, 'loaded', true)
  await snap(mini, 'finance-record-payment')
  await money.callMethod('onVoid')
  await money.callMethod('onSubmitVoid', { detail: '重复登记' })
  await waitData(money, 'view.status', 'voided')
  const records = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(records, 'loaded', true)
  await records.callMethod('onKind', { detail: 'payment' })
  await records.callMethod('onFilter', {
    detail: { status: 'valid', keyword: '', date: 'all', range: null, picks: {} },
  })
  await expect.poll(async () => records.data('rows') as Promise<unknown>).toEqual([])
  await snap(mini, 'finance-record-empty')
  await records.callMethod('onFilter', {
    detail: { status: 'voided', keyword: '', date: 'all', range: null, picks: {} },
  })
  await expect.poll(async () => records.data('rows') as Promise<unknown>).toHaveLength(1)
  await records.callMethod('onFilter', {
    detail: {
      status: '',
      keyword: '',
      date: 'custom',
      range: { from: '2026-09-28', to: '2026-09-28' },
      picks: {},
    },
  })
  await expect.poll(async () => records.data('rows') as Promise<unknown>).toEqual([])
  await records.callMethod('onKind', { detail: 'receipt' })
  await expect.poll(async () => records.data('rows') as Promise<unknown>).not.toEqual([])
})

test('G01 供应商整页保留未保存资料，花材短表单退出确认，库存批次可查看', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const suppliers = await enter(mini, '/packages/purchase/pages/suppliers/index')
  await waitData(suppliers, 'loaded', true)
  await suppliers.callMethod('onCreate')
  const supplierForm = await waitPage(mini, 'packages/purchase/pages/supplier/index')
  await waitData(supplierForm, 'loaded', true)
  await supplierForm.callMethod('onText', {
    detail: '青禾鲜切',
    currentTarget: { dataset: { field: 'name' } },
  })
  expect(await supplierForm.data('changed')).toBe(true)
  const navbar = (await supplierForm.$('components\\/hz-navbar\\/index')) as CustomElement
  await expect.poll(async () => navbar.data('guard') as Promise<unknown>).toBe(true)
  const back = await navbar.$('.hz-navbar__back')
  if (!back) throw new Error('no supplier form back button')
  await back.tap()
  const confirm = (await supplierForm.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await tapText(confirm, copy.confirm.keepEditing)
  expect(await supplierForm.data('form.name')).toBe('青禾鲜切')
  await snap(mini, 'supplier-master')
  await back.tap()
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await tapText(confirm, copy.confirm.discard)
  await waitPage(mini, suppliers.path)
  await suppliers.waitFor(3000)
  await asMini(mini, s, 'u5')
  const mats = await enter(mini, '/packages/warehouse/pages/materials/index')
  await waitData(mats, 'loaded', true)
  await mats.callMethod('onCreate')
  await mats.callMethod('onText', { detail: '芍药', currentTarget: { dataset: { field: 'name' } } })
  await snap(mini, 'material-master')
  const matSheet = (await mats.$('#form-sheet')) as CustomElement
  const closeMaterial = await matSheet.$('.hz-sheet__corner')
  if (!closeMaterial) throw new Error('no material form close button')
  await closeMaterial.tap()
  const discard = (await mats.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => discard.data('show') as Promise<unknown>).toBe(true)
  await tapText(discard, copy.confirm.discard)
  await waitData(mats, 'sheet', false)
  const stock = await enter(mini, '/packages/warehouse/pages/stock/index')
  await waitData(stock, 'loaded', true)
  await snap(mini, 'warehouse-stock')
  const rows = (await stock.data('rows')) as { id: string }[]
  await stock.callMethod('onOpen', { currentTarget: { dataset: { key: rows[0]?.id } } })
  const detail = await waitPage(mini, 'packages/warehouse/pages/material/index')
  await waitData(detail, 'loaded', true)
  expect(await detail.data('batches')).not.toEqual([])
  await snap(mini, 'warehouse-batches')
})
