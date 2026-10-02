import { copy } from '@huazhong/shared'
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
} from './mini.ts'

const suite = setupMiniSuite()

test('D17-F D18-F D25-F 付款撤回、预付退款、作废历史完整保留', async () => {
  const { mini, server } = suite()
  const finance = await asMini(mini, server, 'u6')
  const document = await poOf(server, 'PO-260928-004')
  const payment = dataOf<PaymentDetail>(
    await finance.post('/finance/payments', await paymentInput(server, document, 3000)),
  )
  const page = await enter(mini, '/packages/finance/pages/records/index')
  await waitData(page, 'loaded', true)
  await page.waitFor(800)
  const tabBar = (await page.$('components\\/hz-tabs\\/index')) as CustomElement | null
  const tabs = (await tabBar?.$$('.hz-tabs__item')) as CustomElement[] | undefined
  const paymentTab = tabs?.[1]
  if (!paymentTab) throw new Error('no payment tab')
  await paymentTab.tap()
  await expect.poll(async () => page.data('rows') as Promise<unknown>).toHaveLength(1)
  const card = await page.$('components\\/hz-card\\/index')
  const cardTarget = await card?.$('.hz-card')
  if (!cardTarget) throw new Error('no payment card')
  await cardTarget.tap()
  await waitData(page, 'paymentView.allocations.0.canRevoke', true)
  expect(await page.data('paymentView.title')).toBe(payment.no)
  await tapText(page, copy.rework.revokeAllocation)
  await waitData(page, 'paymentLayer', 'void')
  await inputField(page, '#fund-reason', '核销错误')
  await tapText(page, copy.rework.revokeAllocation)
  await waitData(page, 'paymentLayer', 'detail')
  await waitData(page, 'paymentView.allocations.0.canRevoke', false)
  expect(await page.data('paymentView.allocations.0.sub')).toContain('核销错误')
  await waitData(page, 'paymentView.canRefund', true)
  await tapText(page, copy.rework.registerRefund)
  await waitData(page, 'paymentLayer', 'refund')
  await pickOption(page, '#refund-date', TODAY)
  await inputField(page, '#refund-amount', '10')
  await pickOption(page, '#refund-method', '微信')
  await tapText(page, copy.rework.registerRefund)
  await waitData(page, 'paymentLayer', 'detail')
  await waitData(page, 'paymentView.refunds.0.status', '有效')
  await tapText(page, copy.rework.voidRefund)
  await waitData(page, 'paymentLayer', 'void')
  await inputField(page, '#fund-reason', '退款登记错误')
  await tapText(page, copy.screen.action.confirmVoid)
  await waitData(page, 'paymentView.refunds.0.status', '已作废')
  expect(await page.data('paymentView.refunds.0.meta')).toContain('退款登记错误')
  expect(await page.data('paymentView.refunds.0.canVoid')).toBe(false)
  expect(await page.data('paymentView.allocations')).toHaveLength(1)
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
  const stepper = (await line?.$('components\\/hz-stepper\\/index')) as CustomElement | null
  const control = await stepper?.$('miniprogram_npm\\/tdesign-miniprogram\\/stepper\\/stepper')
  const plus = await control?.$('.t-stepper__plus')
  if (!plus) throw new Error('no quantity plus')
  await plus.tap()
  await expect
    .poll(async () => page.data('lineViews.0.tags') as Promise<unknown>)
    .toContainEqual({ text: copy.rework.overShipped, warn: true })
  const view: unknown = await page.data('view')
  expect(JSON.stringify(view)).not.toMatch(/amount|price|Cents|¥/)
  expect(JSON.stringify(await page.data('lineViews'))).not.toMatch(/amount|price|Cents|¥/)
  await tapText(page, copy.screen.action.ship)
  await waitData(page, 'formError', copy.rework.shipDifferenceNoteRequired)
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
