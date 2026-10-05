import {
  copy,
  statementCopy,
  financeCopy as f,
  type InviteDetail,
  type PoDetail,
  type Supplier,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { materials } from '../../db/schema/index.ts'
import { inviteOf, poInput, poOf, supplierInput, supplierOf } from '../support/purchase.ts'
import { dataOf, idBy } from '../support/sales.ts'
import { asMini, enter, paymentInput, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('B31 供应商删停用行后提交，已提交合并明细并跳整页采购详情', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invite = await inviteOf(s)
  await s.t.db
    .update(materials)
    .set({ enabled: false })
    .where(eq(materials.id, Number(invite.lines[0]?.materialId)))
  let page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('lineViews.0.readonly')).toBe(true)
  expect(await page.data('lineViews.0.tags')).toEqual([{ text: '已停用', warn: false }])
  await page.callMethod('onSubmit')
  await waitData(page, 'formError', '花材已停用，请删掉这一行再提交')
  await snap(mini, 'supplier-supply-disabled')
  await page.callMethod('onRemove', { detail: 0 })
  const extraId = await idBy(s.t, 'materials.name', '尤加利')
  await page.callMethod('onPickPlus', { currentTarget: { dataset: { key: extraId } } })
  await page.callMethod('onPickConfirm')
  await page.callMethod('onPrice', { detail: { index: 0, text: '2.00' } })
  await page.callMethod('onSubmit')
  // 提交成功回 P1 填报列表（直接打开、没有上一页时换到列表，06 章 P4）
  await waitPage(mini, 'packages/supplier/pages/invites/index')
  page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  await waitData(page, 'editable', false)
  expect(await page.data('inviteView.lines')).toMatchObject([
    // 没供的行标「未供」、不显示金额；另报的花材供 1 枝 × ¥2.00
    {
      qty: 0,
      hideAmount: true,
      tags: expect.arrayContaining([{ text: copy.screen.notSupplied, warn: true }]) as unknown,
    },
    { qty: 1, priceCents: 200, tags: [{ text: '另报', warn: false }] },
  ])
  await snap(mini, 'supplier-submitted-unsupplied-extra')
  const submitted = await inviteOf(s)
  await page.callMethod('onPo')
  const detail = await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  await waitData(detail, 'loaded', true)
  expect(await detail.data('view.info.title')).toBe(submitted.supplierName)
  expect(await detail.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ label: '单号', value: submitted.purchaseOrderNo }),
  )
  expect(await detail.data('canEdit')).toBe(true)
  await snap(mini, 'supplier-submitted-purchase-detail')
})

test('F07-F 供应商已结清DZ按整页采购详情进入，只读对账与收款记录', async () => {
  const { mini, server: s } = suite()
  const po = await poOf(s, 'PO-260928-004')
  const input = await paymentInput(s, po)
  dataOf(await (await s.as('u6')).post('/finance/payments', input))
  const api = await asMini(mini, s, 'p2')
  const projected = dataOf<PoDetail>(await api.get(`/supplier/purchase-orders/${po.id}`))
  if (!projected.statement) throw new Error('expected settled statement')
  expect(projected.lockedReason).toBe(statementCopy.sourceLocked(projected.statement.no))
  const page = await enter(mini, '/packages/supplier/pages/orders/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('segmentTabs')).toMatchObject([{ key: 'orders' }, { key: 'statements' }])
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: po.id } } })
  const detail = await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  await waitData(detail, 'loaded', true)
  expect(await detail.data('view.info.title')).toBe(po.supplierName)
  expect(await detail.data('view.notice')).toBe('')
  expect(await detail.data('canCancel')).toBe(false)
  expect(await detail.data('canEdit')).toBe(false)
  expect(await detail.data('view.info.rows')).toContainEqual(
    expect.objectContaining({
      label: '对账单',
      value: `${projected.statement.no}${copy.separator}已结清`,
      url: `/packages/supplier/pages/statement-detail/index?id=${projected.statement.id}`,
    }),
  )
  expect(JSON.stringify(await detail.data('view.info.rows'))).not.toMatch(/财务|应付|未付|付款进度/)
  await snap(mini, 'supplier-purchase-statement-link')
  // 对账单在信息行里，点这一行进只读对账详情
  const info = (await detail.$('components\\/hz-info-rows\\/index')) as CustomElement
  await info.callMethod('onLink', {
    currentTarget: {
      dataset: {
        url: `/packages/supplier/pages/statement-detail/index?id=${projected.statement.id}`,
      },
    },
  })
  const statement = await waitPage(mini, 'packages/supplier/pages/statement-detail/index')
  await waitData(statement, 'loaded', true)
  expect(await statement.data('view.info.title')).toBe(po.supplierName)
  expect(await statement.data('view.info.status')).toBe('settled')
  expect(await statement.data('view.cells')).toContainEqual(
    expect.objectContaining({ label: f.receivable, amountCents: 96000 }),
  )
  // 收款记录一段：本张的一笔付款
  expect(await statement.data('view.receiptSection.groups.0.rows')).toHaveLength(1)
  await snap(mini, 'supplier-statement-settled')
  await statement.callMethod('onSource', { detail: `po:${po.id}` })
  const source = await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  await waitData(source, 'loaded', true)
  expect(await source.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ label: '单号', value: po.no }),
  )
})

test('自动取消邀请的供应商只读页显示自动取消说明和时间', async () => {
  const { mini, server: s } = suite()
  const api = await s.as('u4')
  const invite = await inviteOf(s)
  const supplier = await supplierOf(s)
  const disabled = dataOf<Supplier>(
    await api.patch(`/suppliers/${supplier.id}`, { ...supplierInput(supplier), enabled: false }),
  )
  dataOf(
    await api.patch(`/suppliers/${supplier.id}`, { ...supplierInput(disabled), enabled: true }),
  )
  await asMini(mini, s, 'p1')
  const page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('inviteView.reason.rows')).toEqual(
    expect.arrayContaining([
      { label: '取消原因', value: '停用供应商，自动取消' },
      expect.objectContaining({ label: '取消时间' }),
    ]),
  )
  await snap(mini, 'supplier-invite-auto-cancelled')
})

test.each([
  { field: 'supplier', message: copy.error.supplierDisabled },
  { field: 'account', message: copy.error.accountDisabled },
])('F05-F $field 停用状态与重新启用后的直接登录', async ({ field, message }) => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invites = await enter(mini, '/packages/supplier/pages/invites/index')
  await waitData(invites, 'tabs.0.badge', 1)
  const purchase = await s.as('u4'),
    supplier = await supplierOf(s)
  const disabled = dataOf<Supplier>(
    await purchase.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(supplier),
      ...(field === 'supplier'
        ? { enabled: false }
        : { account: { enabled: false, loginPhone: supplier.account.loginPhone } }),
    }),
  )
  const login = await waitPage(mini, 'pages/login/index')
  await waitData(login, 'phase', 'failure')
  expect(await login.data('failure')).toMatchObject({ state: 'accountDisabled', message })
  await login.waitFor('#login-state')
  const state = (await login.$('#login-state')) as CustomElement
  expect(await state.data('actionText')).toBe(copy.action.logout)
  expect(await login.$('#login-privacy')).toBeNull()
  expect(await login.$('#login-button')).toBeNull()
  await snap(mini, `${field}-disabled`)
  dataOf(
    await purchase.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(disabled),
      enabled: true,
      account: { enabled: true, loginPhone: supplier.account.loginPhone },
    }),
  )
  await login.callMethod('check')
  const restored = await waitPage(mini, 'packages/supplier/pages/invites/index')
  await waitData(restored, 'tabs.0.badge', 0)
  await snap(mini, `${field}-restored`)
})

test('F01-F H05 供应商填报落点、采购单底栏与新邀请角标刷新', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const page = await enter(mini, '/packages/supplier/pages/invites/index')
  await waitData(page, 'tabs.0.badge', 1)
  expect(await page.data('filter.status')).toBe('pending')
  expect(await page.data('tabs')).toMatchObject([
    { key: 'supply', badge: 1 },
    { key: 'orders' },
    { key: 'my' },
  ])
  const invite = await inviteOf(s)
  dataOf(
    await (
      await s.as('u4')
    ).post('/invites', {
      supplierId: invite.supplierId,
      lines: [{ materialId: invite.lines[0]?.materialId, needQty: 10 }],
    }),
  )
  await waitData(page, 'counts.pending', 2)
  await waitData(page, 'tabs.0.badge', 2)
  await snap(mini, 'supplier-invites')
})

test('B27 F02-F I01-F 填报默认需求量、校验、编辑保护、提交后只读', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invite = await inviteOf(s)
  const page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('form.lines.0.qty')).toBe(60)
  await page.callMethod('onRemove', { detail: 0 })
  await waitData(page, 'form.lines', [])
  await page.callMethod('onSubmit')
  await waitData(page, 'formError', '请至少保留一种花材；全部不供请联系采购取消邀请')
  await page.callMethod('load', false)
  await waitData(page, 'form.lines.0.qty', 60)
  await page.callMethod('onQty', { detail: { index: 0, qty: 0 } })
  await page.callMethod('onSubmit')
  await expect
    .poll(async () => page.data('lineViews.0.qtyError') as Promise<unknown>)
    .toContain('供货量')
  await page.callMethod('onQty', { detail: { index: 0, qty: 65 } })
  const purchase = await s.as('u4')
  const edited = dataOf<InviteDetail>(
    await purchase.put(`/invites/${invite.id}`, {
      version: invite.version,
      lines: invite.lines.map((l) => ({ materialId: l.materialId, needQty: 70 })),
    }),
  )
  await expect
    .poll(async () => page.data('realtime') as Promise<unknown>)
    .toContain('采购修改了这次邀请')
  expect(await page.data('form.lines.0.qty')).toBe(65)
  await snap(mini, 'supplier-invite-stale')
  await page.callMethod('onRealtime')
  await waitData(page, 'form.lines.0.qty', 70)
  await page.callMethod('onSubmit')
  await waitData(page, 'lineViews.0.priceError', '请填写单价，赠送的花材填 0')
  expect(await page.data('formError')).toBe('')
  await page.callMethod('onPrice', { detail: { index: 0, text: '3.50' } })
  await snap(mini, 'supplier-supply')
  await page.callMethod('onSubmit')
  // 提交后回到填报邀请列表（没有上一页就换到列表）
  const list = await waitPage(mini, 'packages/supplier/pages/invites/index')
  await waitData(list, 'loaded', true)
  const submitted = await inviteOf(s)
  expect(submitted.version).toBeGreaterThan(edited.version)
  expect(submitted.status).toBe('submitted')
  await snap(mini, 'supplier-submitted')
})

test('F03 B12-F 供应商整页采购修改、实时详情与填报关联状态', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const po = await poOf(s, 'PO-260929-006')
  const page = await enter(mini, '/packages/supplier/pages/orders/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: po.id } } })
  const detail = await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  await waitData(detail, 'loaded', true)
  expect(await detail.data('view.info.title')).toBe(po.supplierName)
  expect(await detail.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ label: '采购员', value: po.buyerName, phone: po.buyerPhone }),
  )
  await detail.callMethod('onEdit')
  const edit = await waitPage(mini, 'packages/supplier/pages/supply/index')
  await waitData(edit, 'loaded', true)
  expect(await edit.data('supplierEditing')).toBe(true)
  await edit.callMethod('onQty', { detail: { index: 0, qty: (po.lines[0]?.qty ?? 0) + 1 } })
  await edit.callMethod('onSubmit')
  await waitPage(mini, 'packages/supplier/pages/po-detail/index')
  const current = await poOf(s, po.no)
  await expect
    .poll(async () => detail.data('view.lines.0.qty') as Promise<unknown>)
    .toBe(current.lines[0]?.qty)
  const api = await s.as('u4')
  const input = poInput(current)
  const changed = dataOf<PoDetail>(
    await api.put(`/purchase-orders/${po.id}`, {
      ...input,
      lines: input.lines.map((line, index) => (index ? line : { ...line, qty: line.qty + 2 })),
      note: '临时补充',
      reason: '联系供应商',
    }),
  )
  // 采购改单后详情实时刷新；内部备注只给员工看，供应商信息卡不写（06 章 P7）
  await expect
    .poll(async () => detail.data('view.lines.0.qty') as Promise<unknown>)
    .toBe(changed.lines[0]?.qty)
  expect(JSON.stringify(await detail.data('view.info.rows'))).not.toContain('临时补充')
  await snap(mini, 'supplier-purchase-detail')
  const list = await enter(mini, '/packages/supplier/pages/invites/index')
  await waitData(list, 'loaded', true)
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, {
      version: changed.version,
      reason: '客户取消订单',
    }),
  )
  await list.callMethod('onFilter', {
    detail: { status: '', keyword: '', date: 'all', range: null, picks: {} },
  })
  const submitted = await inviteOf(s, 'YQ-260928-001')
  await list.callMethod('onOpen', { currentTarget: { dataset: { key: submitted.id } } })
  const supply = await waitPage(mini, 'packages/supplier/pages/supply/index')
  await waitData(supply, 'loaded', true)
  expect(await supply.data('editable')).toBe(false)
  expect(await supply.data('inviteView.info.status')).toBe('submitted')
  expect(await supply.data('inviteView.poLink')).toBe(`${po.no}${copy.separator}已取消`)
  await snap(mini, 'supplier-invites-cancelled')
})
