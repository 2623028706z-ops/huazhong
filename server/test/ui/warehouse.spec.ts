import {
  financeCopy as f,
  statementCopy,
  type PoDetail,
  type StatementDetail,
} from '@huazhong/shared'
import { expect, test } from 'vitest'
import { inviteOf, poOf } from '../support/purchase.ts'
import { dataOf } from '../support/sales.ts'
import { openStatement } from '../support/statements.ts'
import { asMini, enter, paymentInput, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'
import { editWarehouseLine } from './warehouse-lines.ts'

const suite = setupMiniSuite()

test('H03 采购改单表单遇取消时收起提交按钮', async () => {
  const { mini, server: s } = suite()
  const api = await asMini(mini, s, 'u4'),
    po = await poOf(s)
  const page = await enter(mini, `/packages/purchase/pages/order-form/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await editWarehouseLine(page, 0, { qty: 120 })
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, { version: po.version, reason: '活动取消' }),
  )
  await waitData(page, 'editable', false)
  await waitData(page, 'changed', false)
  expect(await page.$('#form-action')).toBeNull()
  expect(await page.data('lockedReason')).toContain('已取消')
  await expect.poll(async () => (await page.$('.u-info__title'))?.text()).toBe(po.supplierName)
  expect(await page.data('poView.info.rows')).toContainEqual(
    expect.objectContaining({ value: po.no }),
  )
  await snap(mini, 'purchase-edit-cancelled')
})

test('H03 供应商填写中邀请取消后只读，未提交草稿不再能提交', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invite = await inviteOf(s)
  const page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  await editWarehouseLine(page, 0, { qty: 65, price: '3.50' })
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

test('收货时改了单价，表单出现改价原因', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u5')
  const po = await poOf(s)
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'receiving', true)
  expect(await page.$('#receive-reason')).toBeNull()
  await editWarehouseLine(page, 0, { price: '0.01' })
  await waitData(page, 'repriced', true)
  await expect.poll(async () => (await page.$('#receive-reason')) !== null).toBe(true)
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
  await editWarehouseLine(page, 0, { qty: 10 })
  await snap(mini, 'warehouse-return')
  await page.callMethod('onSaveSheet')
  await waitData(page, 'sheet', '')
  await waitData(page, 'realtime', '')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'reprice' } } })
  await editWarehouseLine(page, 0, { price: '7.50' })
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
  const repriced = dataOf<PoDetail>(await (await s.as('u5')).get(`/purchase-orders/${po.id}`))
  expect(repriced.amountCents).toBe(82500)
  expect(await page.data('view.lines.0.priceCents')).toBe(750)
  await snap(mini, 'warehouse-repriced')
})

test('B15 DZ开出即锁仓库操作，付款作废仍锁，作废DZ后解锁', async () => {
  const { mini, server: s } = suite()
  const warehouse = await asMini(mini, s, 'u5')
  const po = await poOf(s, 'PO-260928-004')
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  const finance = await s.as('u6')
  const statement = await openStatement(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  const locked: unknown = expect.arrayContaining([
    expect.objectContaining({ code: 'return', disabled: true }),
    expect.objectContaining({ code: 'reprice', disabled: true }),
    expect.objectContaining({ code: 'voidPo', disabled: true }),
  ])
  await expect.poll(async () => page.data('buttons') as Promise<unknown>).toEqual(locked)
  expect(await page.data('view.notice')).toBe(statementCopy.sourceLocked(statement.no))
  const fresh = dataOf<PoDetail>(await warehouse.get(`/purchase-orders/${po.id}`))
  const payment = dataOf<{ id: string; version: number }>(
    await finance.post('/finance/payments', await paymentInput(s, fresh)),
  )
  await expect.poll(async () => page.data('buttons') as Promise<unknown>).toEqual(locked)
  await snap(mini, 'warehouse-paid')
  dataOf(
    await finance.post(`/finance/payments/${payment.id}/void`, {
      version: payment.version,
      reason: '付错账户',
    }),
  )
  await expect.poll(async () => page.data('buttons') as Promise<unknown>).toEqual(locked)
  expect(await page.data('view.notice')).toBe(statementCopy.sourceLocked(statement.no))
  await snap(mini, 'warehouse-paid-voided')
  const refreshed = dataOf<StatementDetail>(
    await finance.get(`/finance/statements/${statement.id}`),
  )
  dataOf(
    await finance.post(`/finance/statements/${statement.id}/void`, {
      version: refreshed.version,
      reason: '重新核对',
    }),
  )
  await expect
    .poll(async () => page.data('buttons') as Promise<unknown>)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'return', disabled: false }),
        expect.objectContaining({ code: 'reprice', disabled: false }),
        expect.objectContaining({ code: 'voidPo', disabled: false }),
      ]),
    )
  expect(await page.data('view.notice')).toBe('')
})

test('供应商对账只列DZ，开单归集未对账金额、付款后整张结清，来源跳只读采购详情', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p2')
  const po = await poOf(s, 'PO-260928-004')
  let page = await enter(mini, '/packages/supplier/pages/statement/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('cells')).toMatchObject([{ amountCents: 0 }, { amountCents: 96000 }])
  expect(await page.data('rows')).toEqual([])
  const statement = await openStatement(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  await waitData(page, 'rows.0.id', statement.id)
  await waitData(page, 'rows.0.status', 'unsettled')
  expect(await page.data('cells')).toMatchObject([{ amountCents: 96000 }, { amountCents: 0 }])
  const fresh = dataOf<PoDetail>(await (await s.as('u4')).get(`/purchase-orders/${po.id}`))
  dataOf(await (await s.as('u6')).post('/finance/payments', await paymentInput(s, fresh)))
  await waitData(page, 'rows.0.status', 'settled')
  expect(await page.data('rows.0.fields')).toContainEqual({
    label: f.receivable,
    value: '¥960.00',
    amount: true,
  })
  expect(await page.data('cells')).toMatchObject([{ amountCents: 0 }, { amountCents: 0 }])
  await snap(mini, 'supplier-statement')
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: statement.id } } })
  page = await waitPage(mini, 'packages/supplier/pages/statement-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.info.rows')).toContainEqual({ label: f.no, value: statement.no })
  await snap(mini, 'supplier-statement-detail')
  await page.callMethod('onSource', { currentTarget: { dataset: { key: `po:${po.id}` } } })
  page = await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.info.title')).toBe(po.supplierName)
  expect(await page.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ value: po.no }),
  )
  expect(await page.data('canEdit')).toBe(false)
  expect(await page.data('canCancel')).toBe(false)
  await asMini(mini, s, 'u6')
  const list = await enter(mini, '/packages/finance/pages/suppliers/index')
  await waitData(list, 'loaded', true)
  await snap(mini, 'finance-suppliers')
  await list.callMethod('onOpen', { currentTarget: { dataset: { key: po.supplierId } } })
  const account = await waitPage(mini, 'packages/finance/pages/supplier/index')
  await waitData(account, 'loaded', true)
  await snap(mini, 'finance-supplier-statement')
})
