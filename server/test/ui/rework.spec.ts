import { copy, financeCopy as f } from '@huazhong/shared'
import type {
  PaymentDetail,
  ShippingDetail,
  OutputOf,
  contract,
  StaffItem,
  CustomerItem,
} from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { poOf } from '../support/purchase.ts'
import { dataOf, idBy, TODAY } from '../support/sales.ts'
import {
  asMini,
  enter,
  inputField,
  paymentInput,
  pickOption,
  setupMiniSuite,
  snap,
  tapText,
  waitData,
  waitPage,
} from './mini.ts'

const suite = setupMiniSuite()

test('D17-F D18-F D25-F 多付退回在往来页登记，整张DZ与作废历史保留', async () => {
  const { mini, server } = suite()
  const finance = await asMini(mini, server, 'u6')
  const document = await poOf(server, 'PO-260928-004')
  const payment = dataOf<PaymentDetail>(
    await finance.post('/finance/payments', await paymentInput(server, document, 99000)),
  )
  const page = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onKind', { detail: 'payment' })
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  const card = await page.$('components\\/hz-card\\/index')
  const cardTarget = await card?.$('.hz-card')
  if (!cardTarget) throw new Error('no payment card')
  await cardTarget.tap()
  const money = await waitPage(mini, 'packages/finance/pages/money/index')
  await waitData(money, 'loaded', true)
  // 标题是供应商，单号放信息行
  expect(await money.data('view.title')).toBe(document.supplierName)
  expect(await money.data('view.rows')).toContainEqual(
    expect.objectContaining({ label: f.no, value: payment.no }),
  )
  expect(await money.data('view.statements.0.rows')).toHaveLength(1)
  const ledger = await enter(
    mini,
    `/packages/finance/pages/supplier/index?id=${document.supplierId}`,
  )
  await waitData(ledger, 'canRefund', true)
  // 「退回」收在底栏「更多」里
  await ledger.callMethod('onRefund')
  await waitData(ledger, 'refundSheet', true)
  await pickOption(ledger, '#refund-date', TODAY)
  await inputField(ledger, '#refund-amount', '10')
  await pickOption(ledger, '#refund-method', '微信')
  await tapText(ledger, f.confirmRefund)
  await waitData(ledger, 'refundRows.0.status', '有效')
  await expect
    .poll(async () => ledger.data('summary.lines.0.text') as Promise<unknown>)
    .toContain(`${f.supplierCredited} ¥20.00`)
  // 点退回记录行打开这一笔，作废在弹层底栏
  const refundId = (await ledger.data('refundRows.0.id')) as string
  const openRefund = () =>
    ledger.callMethod('onRefundRow', { currentTarget: { dataset: { key: refundId } } })
  await openRefund()
  await waitData(ledger, 'refundDetail.id', refundId)
  expect(await ledger.data('refundDetail.hasVoid')).toBe(true)
  await tapText(ledger, f.voidRefund)
  const reason = (await ledger.$('components\\/hz-reason-sheet\\/index')) as CustomElement
  await waitData(ledger, 'voidRefundId', refundId)
  await inputField(reason, 'components\\/hz-field\\/index', '退款登记错误')
  await tapText(reason, f.confirmVoid)
  await waitData(ledger, 'refundRows.0.status', '已作废')
  expect(await ledger.data('refundRows.0.reason')).toBe('退款登记错误')
  await expect
    .poll(async () => ledger.data('summary.lines.0.text') as Promise<unknown>)
    .toContain(`${f.supplierCredited} ¥30.00`)
  await openRefund()
  await waitData(ledger, 'refundDetail.hasVoid', false)
  const detail = await enter(
    mini,
    `/packages/finance/pages/money/index?kind=payment&id=${payment.id}`,
  )
  await waitData(detail, 'loaded', true)
  await tapText(detail, f.voidPayment)
  const voidReason = (await detail.$('components\\/hz-reason-sheet\\/index')) as CustomElement
  await inputField(voidReason, 'components\\/hz-field\\/index', '付款登记错误')
  await tapText(voidReason, f.confirmVoid)
  await waitData(detail, 'view.status', 'voided')
  // 作废后仍列出原来结清的那张，置灰；对账单回到未结清
  expect(await detail.data('view.statements.0.rows')).toMatchObject([
    { muted: true, tags: [{ text: f.unsettled, warn: true }] },
  ])
  await snap(mini, 'rework-funds-full-history')
})

test('H3 发货专用页面管理员也无金额，少发多发预览无财务字段', async () => {
  const { mini, server } = suite()
  const admin = await asMini(mini, server, 'u1')
  const orders = dataOf<OutputOf<typeof contract.listShippingOrders>>(
    await admin.get('/shipping/orders?status=to_ship'),
  )
  const card = orders.items.find((item) => item.shipDate && item.shipDate <= TODAY)
  if (!card) throw new Error('no due shipment')
  const order = dataOf<ShippingDetail>(await admin.get(`/shipping/orders/${card.id}`))
  const page = await enter(mini, `/packages/shipping/pages/ship/index?id=${order.id}`)
  await waitData(page, 'loaded', true)
  await page.waitFor(800)
  const line = await page.$('components\\/hz-line-item\\/index')
  if (!line) throw new Error('no shipping lines')
  const row = await line.$('.hz-line-item__row')
  if (!row) throw new Error('no shipping row')
  await row.tap()
  const stepper = (await line.$('components\\/hz-stepper\\/index')) as CustomElement | null
  const control = await stepper?.$('miniprogram_npm\\/tdesign-miniprogram\\/stepper\\/stepper')
  const plus = await control?.$('.t-stepper__plus')
  if (!plus) throw new Error('no quantity plus')
  await plus.tap()
  await tapText(line as CustomElement, '确定')
  await expect
    .poll(async () => page.data('lineViews.0.tags') as Promise<unknown>)
    .toContainEqual({ text: copy.rework.overShipped, warn: true })
  const view: unknown = await page.data('view')
  expect(JSON.stringify(view)).not.toMatch(/amount|price|Cents|¥/)
  expect(JSON.stringify(await page.data('lineViews'))).not.toMatch(/amount|price|Cents|¥/)
  // 少发、多发的发货备注选填：不写备注页面也不拦，这里不真发货，只核对没有备注必填的报错
  expect(await page.data('formError')).toBe('')
  await snap(mini, 'rework-shipping-quantity-only')
})

test('G30-F 调岗后日志模块来自历史而非当前岗位', async () => {
  const { mini, server } = suite()
  const admin = await server.as('u1')
  const employee = await server.as('u2')
  const customerId = await idBy(server.t, 'customers.name', '晨曦花艺')
  const before = dataOf<{ items: StaffItem[] }>(await admin.get('/staff'))
  const staff = before.items.find((item) => item.phone === '13700000002')
  if (!staff) throw new Error('no sales staff')
  const customers = dataOf<{ items: CustomerItem[] }>(await employee.get('/customers'))
  const customer = customers.items.find((item) => item.id === customerId)
  if (!customer) throw new Error('no customer')
  dataOf(
    await employee.patch(`/customers/${customerId}`, { ...customer, name: `${customer.name}核对` }),
  )
  dataOf(await admin.patch(`/staff/${staff.id}`, { ...staff, modules: ['warehouse'] }))
  await asMini(mini, server, 'u2')
  const page = await enter(mini, '/pages/logs/index')
  await waitData(page, 'loaded', true)
  const logs = dataOf<OutputOf<typeof contract.listLogs>>(await employee.get('/logs'))
  expect(logs.filterModules).toContain('sales')
  if (logs.filterModules.length > 1)
    expect(await page.data('dimensions.0.options')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sales' })]),
    )
  expect(await page.data('groups')).not.toEqual([])
  await snap(mini, 'rework-transferred-employee-logs')
})

test('底栏有按钮在提交时，同一排其余按钮锁住', async () => {
  const { mini, server } = suite()
  await asMini(mini, server, 'u2')
  const id = await idBy(server.t, 'orders.no', 'SO-260929-018')
  const page = await enter(mini, `/packages/sales/pages/order-detail/index?id=${id}`)
  await waitData(page, 'loaded', true)
  const codes = ((await page.data('buttons')) as { code: string }[]).map((button) => button.code)
  expect(codes.length).toBeGreaterThan(1)
  const blockedOf = async () =>
    Promise.all(
      ((await page.$$('components\\/hz-button\\/index')) as CustomElement[]).map(
        async (button) => (await button.data('blocked')) as boolean,
      ),
    )
  const total = (await blockedOf()).length
  expect(total).toBeGreaterThan(1)
  expect(await blockedOf()).not.toContain(true)
  // 底栏只放前两个按钮（其余收进「更多」），提交中的按钮在底栏上
  await page.setData({ busy: codes[1] })
  await expect.poll(async () => (await blockedOf()).filter(Boolean).length).toBe(total - 1)
  await page.setData({ busy: '' })
  await expect.poll(async () => (await blockedOf()).filter(Boolean).length).toBe(0)
})
