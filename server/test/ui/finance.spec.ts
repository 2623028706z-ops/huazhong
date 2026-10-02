import type { PoDetail, PaymentDetail } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { createPo, poOf, receiveInput } from '../support/purchase.ts'
import { dataOf, TODAY } from '../support/sales.ts'
import { asMini, enter, paymentInput, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('B16 H06 D08 登记付款账本变化保留草稿，重核后再次提交', async () => {
  const { mini, server: s } = suite()
  const finance = await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  const statement = await enter(mini, `/packages/finance/pages/supplier/index?id=${po.supplierId}`)
  await waitData(statement, 'loaded', true)
  await statement.callMethod('onAction', {
    currentTarget: { dataset: { code: 'registerPayment' } },
  })
  const page = await waitPage(mini, 'packages/finance/pages/receive/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onDate', { detail: TODAY })
  await page.callMethod('onAmount', { detail: '960' })
  await page.callMethod('onMethod', { detail: '微信' })
  await page.callMethod('onNote', { detail: '保留付款草稿' })
  const warehouse = await s.as('u5')
  dataOf(
    await warehouse.post(`/purchase-orders/${po.id}/reprice`, {
      version: po.version,
      reason: '让价',
      lines: [{ poLineId: po.lines[0]?.id, priceCents: 750 }],
    }),
  )
  await waitData(page, 'needsReview', true)
  expect(await page.data('form.amountText')).toBe('960')
  expect(await page.data('form.allocs.0.text')).toBe('960.00')
  await page.callMethod('onReviewLedger')
  await waitData(page, 'form.allocs.0.unpaidCents', 90000)
  expect(await page.data('form.allocs.0.text')).toBe('')
  expect(await page.data('form.methodName')).toBe('微信')
  expect(await page.data('form.note')).toBe('保留付款草稿')
  await snap(mini, 'finance-payment-review')
  await page.callMethod('onFill', { currentTarget: { dataset: { index: 0 } } })
  await page.callMethod('onSubmit')
  await waitPage(mini, 'packages/finance/pages/supplier/index')
  const records = dataOf<{ items: PaymentDetail[] }>(
    await finance.get('/finance/records?kind=payment'),
  )
  const payment = records.items[0]
  if (!payment) throw new Error('no payment')
  expect(payment.prepaidCents).toBe(6000)
  const recordPage = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(recordPage, 'loaded', true)
  await recordPage.callMethod('onKind', { detail: 'payment' })
  await expect.poll(async () => recordPage.data('rows') as Promise<unknown>).toHaveLength(1)
  await recordPage.callMethod('onOpen', { currentTarget: { dataset: { key: payment.id } } })
  await waitData(recordPage, 'paymentLayer', 'detail')
  await expect
    .poll(async () => recordPage.data('paymentView.allocations') as Promise<unknown>)
    .toHaveLength(1)
  await recordPage.callMethod('onVoidPayment')
  await recordPage.callMethod('onPaymentReason', { detail: '付错账户' })
  await recordPage.callMethod('onSubmitPaymentVoid')
  await waitData(recordPage, 'paymentView.status', 'voided')
  expect(await recordPage.data('paymentView.allocations')).toHaveLength(1)
  await snap(mini, 'finance-payment-voided')
})

test('B17 全部退货后重核撤下核销，付款草稿可改为预付', async () => {
  const { mini, server: s } = suite()
  const warehouse = await s.as('u5')
  const created = await createPo(s)
  const po = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${created.id}/receive`, receiveInput(created)),
  )
  await asMini(mini, s, 'u6')
  const page = await enter(
    mini,
    `/packages/finance/pages/receive/index?kind=payment&supplierId=${po.supplierId}`,
  )
  await waitData(page, 'loaded', true)
  await page.callMethod('onAmount', { detail: '210' })
  dataOf(
    await warehouse.post(`/purchase-orders/${po.id}/returns`, {
      version: po.version,
      lines: po.lines.map((line) => ({ poLineId: line.id, qty: line.receivedQty })),
    }),
  )
  await waitData(page, 'needsReview', true)
  await page.callMethod('onReviewLedger')
  await expect.poll(async () => page.data('allocRows') as Promise<unknown>).toEqual([])
  expect(await page.data('form.amountText')).toBe('210')
  expect(await page.data('summary')).toBe('本次核销 ¥0.00 / 转为预付 ¥210.00')
  await snap(mini, 'finance-no-payable-prepaid-draft')
})

test('D09 收付款记录收款付款标签切换、独立状态数量和状态日期筛选', async () => {
  const { mini, server: s } = suite()
  const finance = await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  dataOf(await finance.post('/finance/payments', await paymentInput(s, po)))
  const page = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('kind')).toBe('receipt')
  expect(await page.data('filter.picks')).toEqual({})
  await snap(mini, 'finance-records-receipt-tab')
  await page.callMethod('onKind', { detail: 'payment' })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  // 收付款状态不是等待类，状态标签不带数量（05 章第 1.3 节）
  expect(await page.data('counts')).toEqual({})
  await snap(mini, 'finance-records-payment-tab')
  const rows = (await page.data('rows')) as { id: string }[]
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: rows[0]?.id } } })
  await waitData(page, 'paymentLayer', 'detail')
  await snap(mini, 'finance-record-payment')
  await page.callMethod('onVoidPayment')
  await page.callMethod('onPaymentReason', { detail: '重复登记' })
  await page.callMethod('onSubmitPaymentVoid')
  await waitData(page, 'paymentView.status', 'voided')
  await page.callMethod('onClosePayment')
  await page.callMethod('onFilter', {
    detail: { status: 'valid', keyword: '', date: 'all', range: null, picks: {} },
  })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toEqual([])
  await snap(mini, 'finance-record-empty')
  await page.callMethod('onFilter', {
    detail: { status: 'voided', keyword: '', date: 'all', range: null, picks: {} },
  })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  await page.callMethod('onFilter', {
    detail: {
      status: '',
      keyword: '',
      date: 'custom',
      range: { from: '2026-09-28', to: '2026-09-28' },
      picks: {},
    },
  })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toEqual([])
  await page.callMethod('onKind', { detail: 'receipt' })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).not.toEqual([])
})

test('G01 供应商和花材短表单未保存时可继续填写，库存批次可查看', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const suppliers = await enter(mini, '/packages/purchase/pages/suppliers/index')
  await waitData(suppliers, 'loaded', true)
  await suppliers.callMethod('onCreate')
  await suppliers.callMethod('onText', {
    detail: '青禾鲜切',
    currentTarget: { dataset: { field: 'name' } },
  })
  const sheet = (await suppliers.$('#form-sheet')) as CustomElement
  await sheet.callMethod('onCorner')
  const confirm = (await suppliers.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await confirm.callMethod('onCancel')
  expect(await suppliers.data('form.name')).toBe('青禾鲜切')
  await snap(mini, 'supplier-master')
  await sheet.callMethod('onCorner')
  await confirm.callMethod('onConfirm')
  await asMini(mini, s, 'u5')
  const mats = await enter(mini, '/packages/warehouse/pages/materials/index')
  await waitData(mats, 'loaded', true)
  await mats.callMethod('onCreate')
  await mats.callMethod('onText', { detail: '芍药', currentTarget: { dataset: { field: 'name' } } })
  await snap(mini, 'material-master')
  const matSheet = (await mats.$('#form-sheet')) as CustomElement
  await matSheet.callMethod('onCorner')
  const discard = (await mats.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => discard.data('show') as Promise<unknown>).toBe(true)
  await discard.callMethod('onConfirm')
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
