import { copy } from '@huazhong/shared'
import { expect, test } from 'vitest'
import { inviteOf, poOf } from '../support/purchase.ts'
import { dataOf } from '../support/sales.ts'
import { asMini, enter, paymentInput, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('H03 采购改单表单遇取消时收起提交按钮', async () => {
  const { mini, server: s } = suite()
  const api = await asMini(mini, s, 'u4'),
    po = await poOf(s)
  const page = await enter(mini, `/packages/purchase/pages/order-form/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onQty', { detail: { index: 0, qty: 120 } })
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, { version: po.version, reason: '活动取消' }),
  )
  await waitData(page, 'editable', false)
  await waitData(page, 'changed', false)
  expect(await page.$('#form-action')).toBeNull()
  expect(await page.data('lockedReason')).toContain('已取消')
  await expect.poll(async () => (await page.$('.u-info__title'))?.text()).toBe(po.no)
  await snap(mini, 'purchase-edit-cancelled')
})

test('H03 供应商填写中邀请取消后只读，未提交草稿不再能提交', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invite = await inviteOf(s)
  const page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onQty', { detail: { index: 0, qty: 65 } })
  dataOf(await (await s.as('u4')).post(`/invites/${invite.id}/cancel`, { version: invite.version }))
  await waitData(page, 'editable', false)
  await waitData(page, 'inviteView.info.status', 'cancelled')
  expect(await page.data('inviteView.reason.rows')).toEqual(
    expect.arrayContaining([
      { label: '取消原因', value: '采购已取消这次邀请' },
      expect.objectContaining({ label: '取消时间' }),
    ]),
  )
  expect(await page.$('#form-action')).toBeNull()
  await snap(mini, 'supplier-invite-cancelled')
})

test('C01 C02 G01 G08 H10 退货和改价弹层，未修改直接关闭、原因标错清除、自己操作不提示', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u5')
  const po = await poOf(s, 'PO-260928-004')
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  expect(((await page.data('buttons')) as { code: string }[]).map((button) => button.code)).toEqual(
    expect.arrayContaining(['return', 'reprice']),
  )
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'return' } } })
  await waitData(page, 'sheet', 'return')
  expect(await page.data('changed')).toBe(false)
  expect(await page.data('lines.0.max')).toBe(86)
  expect(await page.data('lineViews.0.meta')).toBe('可退 86 枝')
  await page.callMethod('onQty', { detail: { index: 0, qty: 10 } })
  await snap(mini, 'warehouse-return')
  await page.callMethod('onSaveSheet')
  await waitData(page, 'sheet', '')
  await waitData(page, 'realtime', '')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'reprice' } } })
  await page.callMethod('onPrice', { detail: { index: 0, text: '7.50' } })
  await page.callMethod('onSaveSheet')
  await waitData(page, 'fields.reason', '请填写改价原因')
  expect(await page.data('error')).toBe('')
  expect(await page.$$('hz-error')).toHaveLength(0)
  await snap(mini, 'warehouse-reprice-error')
  await page.callMethod('onReason', { detail: '供应商让价' })
  expect(await page.data('error')).toBe('')
  await page.callMethod('onSaveSheet')
  await waitData(page, 'sheet', '')
  await waitData(page, 'realtime', '')
  expect(await page.data('view.amountRows')).toContainEqual({ label: '应付', value: '¥825.00' })
  await snap(mini, 'warehouse-repriced')
})

test('B15 付款后仓库仍能退货、改价，付款作废后照常', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u5')
  const po = await poOf(s, 'PO-260928-004')
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  const finance = await s.as('u6')
  const payment = dataOf<{ id: string; version: number }>(
    await finance.post('/finance/payments', await paymentInput(s, po)),
  )
  const editable: unknown = expect.arrayContaining([
    expect.objectContaining({ code: 'return', disabled: false }),
    expect.objectContaining({ code: 'reprice', disabled: false }),
  ])
  const paidRow = async () =>
    ((await page.data('view.amountRows')) as { label: string; value: string }[]).find(
      (row) => row.label === copy.screen.label.paid,
    )?.value
  await expect.poll(paidRow).not.toBe('¥0.00')
  expect(await page.data('buttons')).toEqual(editable)
  expect(await page.data('view.notice')).toBe('')
  await snap(mini, 'warehouse-paid')
  dataOf(
    await finance.post(`/finance/payments/${payment.id}/void`, {
      version: payment.version,
      reason: '付错账户',
    }),
  )
  await expect.poll(paidRow).toBe('¥0.00')
  expect(await page.data('buttons')).toEqual(editable)
  await snap(mini, 'warehouse-paid-voided')
})

test('阶段 4 供应商端对账显示单据应付金额，付款后金额保留并实时变为已付款', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p2')
  const po = await poOf(s, 'PO-260928-004')
  const page = await enter(mini, '/packages/supplier/pages/statement/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('cells')).toMatchObject([
    { amountCents: 96000 },
    { amountCents: 0 },
    { amountCents: 96000 },
  ])
  dataOf(await (await s.as('u6')).post('/finance/payments', await paymentInput(s, po)))
  await waitData(page, 'rows.0.status', 'paid')
  expect(await page.data('rows.0.amount')).toBe(96000)
  expect(await page.data('cells')).toMatchObject([
    { amountCents: 96000 },
    { amountCents: 96000 },
    { amountCents: 0 },
  ])
  await snap(mini, 'supplier-statement')
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: `po:${po.id}` } } })
  await waitData(page, 'view.info.title', po.no)
  await snap(mini, 'supplier-statement-detail')
  await asMini(mini, s, 'u6')
  const list = await enter(mini, '/packages/finance/pages/suppliers/index')
  await waitData(list, 'loaded', true)
  await snap(mini, 'finance-suppliers')
  await list.callMethod('onOpen', { currentTarget: { dataset: { key: po.supplierId } } })
  const statement = await waitPage(mini, 'packages/finance/pages/supplier/index')
  await waitData(statement, 'loaded', true)
  await snap(mini, 'finance-supplier-statement')
})
