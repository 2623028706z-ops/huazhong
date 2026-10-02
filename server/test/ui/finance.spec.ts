import type { PoDetail } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { createPo, poOf, receiveInput } from '../support/purchase.ts'
import { dataOf, TODAY } from '../support/sales.ts'
import { asMini, enter, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('B16 H06 D08 付款弹层应付变化，付款和作废留在本页', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  const page = await enter(mini, `/packages/finance/pages/payable/index?docType=po&id=${po.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'pay' } } })
  await waitData(page, 'register', true)
  await page.callMethod('onDate', { detail: TODAY })
  await page.callMethod('onMethod', { detail: '微信' })
  const wh = await s.as('u5')
  dataOf(
    await wh.post(`/purchase-orders/${po.id}/reprice`, {
      version: po.version,
      reason: '让价',
      lines: [{ poLineId: po.lines[0]?.id, priceCents: 750 }],
    }),
  )
  await waitData(page, 'amount', '¥900.00')
  expect(await page.data('error')).toBe('应付已变为 ¥900.00，请核对后再付款')
  expect(await page.data('form.methodName')).toBe('微信')
  await snap(mini, 'finance-payment-review')
  await page.callMethod('onSubmit')
  await waitData(page, 'hasPayment', true)
  await page.callMethod('onViewPayment')
  await waitData(page, 'paymentLayer', 'detail')
  await waitData(page, 'paymentView.status', 'valid')
  await page.callMethod('onVoidPayment')
  await waitData(page, 'paymentLayer', 'void')
  await page.callMethod('onSubmitPaymentVoid')
  await waitData(page, 'paymentFields.reason', '请填写作废原因')
  expect(await page.data('paymentError')).toBe('')
  await page.callMethod('onPaymentReason', { detail: '付错供应商账户' })
  await page.callMethod('onSubmitPaymentVoid')
  await waitData(page, 'paymentLayer', 'detail')
  await waitData(page, 'paymentView.status', 'voided')
  expect((await mini.currentPage())?.path).toBe(page.path)
  await snap(mini, 'finance-payment-voided')
})

test('B17 全部退货后付款弹层关闭并显示整页状态', async () => {
  const { mini, server: s } = suite()
  const wh = await s.as('u5')
  const created = await createPo(s)
  const po = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${created.id}/receive`, receiveInput(created)),
  )
  await asMini(mini, s, 'u6')
  const page = await enter(mini, `/packages/finance/pages/payable/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'pay' } } })
  dataOf(
    await wh.post(`/purchase-orders/${po.id}/returns`, {
      version: po.version,
      lines: po.lines.map((l) => ({ poLineId: l.id, qty: l.receivedQty })),
    }),
  )
  await waitData(page, 'noPayment', true)
  expect(await page.data('register')).toBe(false)
  expect(await page.$('hz-action-bar')).toBeNull()
  const state = (await page.$('#no-payment')) as CustomElement
  expect(await state.data('message')).toBe('这张单已不需要付款')
  await snap(mini, 'finance-no-payment')
})

test('D09 收付款记录收款付款标签切换、独立状态数量和状态日期筛选', async () => {
  const { mini, server: s } = suite()
  const finance = await asMini(mini, s, 'u6')
  const po = await poOf(s, 'PO-260928-004')
  dataOf(
    await finance.post('/finance/payments', {
      docType: 'po',
      docId: po.id,
      amountCents: po.payableCents,
      payDate: TODAY,
      methodName: '微信',
      note: '',
    }),
  )
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
