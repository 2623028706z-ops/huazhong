import { copy, type InviteDetail, type PoDetail, type Supplier } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { materials } from '../../db/schema/index.ts'
import {
  inviteOf,
  payInput,
  poInput,
  poOf,
  supplierInput,
  supplierOf,
} from '../support/purchase.ts'
import { dataOf, idBy } from '../support/sales.ts'
import { asMini, enter, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('B31 供应商删停用行后直接提交，已提交合并需求、未供和另报', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const invite = await inviteOf(s)
  await s.t.db
    .update(materials)
    .set({ enabled: false })
    .where(eq(materials.id, Number(invite.lines[0]?.materialId)))
  const page = await enter(mini, `/packages/supplier/pages/supply/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('lineViews.0.readonly')).toBe(true)
  expect(await page.data('lineViews.0.tags')).toEqual([{ text: '已停用', warn: true }])
  await page.callMethod('onSubmit')
  await waitData(page, 'formError', '花材已停用，请删掉这一行再提交')
  await snap(mini, 'supplier-supply-disabled')
  await page.callMethod('onRemove', { detail: 0 })
  const extraId = await idBy(s.t, 'materials.name', '尤加利')
  await page.callMethod('onPick', { currentTarget: { dataset: { key: extraId } } })
  await page.callMethod('onPrice', { detail: { index: 0, text: '2.00' } })
  await page.callMethod('onSubmit')
  await waitData(page, 'editable', false)
  expect(await page.data('inviteView.lines')).toMatchObject([
    { subText: '未供', hideAmount: true },
    { subText: '供 1 枝 × ¥2.00', tags: [{ text: '另报', warn: false }] },
  ])
  await snap(mini, 'supplier-submitted-unsupplied-extra')
  await asMini(mini, s, 'u4')
  const list = await enter(mini, '/packages/purchase/pages/invites/index')
  await waitData(list, 'loaded', true)
  await list.callMethod('open', invite.id)
  await waitData(list, 'view.info.status', 'submitted')
  await snap(mini, 'invite-detail-submitted')
})

test('供应商已付款采购单详情不显示财务和仓库锁定提示', async () => {
  const { mini, server: s } = suite()
  const po = await poOf(s, 'PO-260928-004')
  dataOf(await (await s.as('u6')).post('/finance/payments', payInput(po)))
  const api = await asMini(mini, s, 'p2')
  expect(
    dataOf<PoDetail>(await api.get(`/supplier/purchase-orders/${po.id}`)).lockedReason,
  ).toBeNull()
  const page = await enter(mini, `/packages/supplier/pages/orders/index?id=${po.id}`)
  await waitData(page, 'sheet', true)
  await waitData(page, 'view.info.title', po.no)
  expect(await page.data('view.notice')).toBe('')
  expect(await page.data('view.amountRows')).not.toContainEqual(
    expect.objectContaining({ label: '财务' }),
  )
  await snap(mini, 'supplier-purchase-paid-detail')
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
  const home = await enter(mini, '/packages/supplier/pages/home/index')
  await waitData(home, 'hero.badge', 1)
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
  const restored = await waitPage(mini, 'packages/supplier/pages/home/index')
  await waitData(restored, 'hero.badge', 0)
  await snap(mini, `${field}-restored`)
})

test('F01-F H05 供应商首页填报入口、底栏角标随新邀请刷新', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const page = await enter(mini, '/packages/supplier/pages/home/index')
  await waitData(page, 'hero.badge', 1)
  expect(await page.data('tabs')).toMatchObject([
    { key: 'home' },
    { key: 'supply', badge: 1 },
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
  await waitData(page, 'hero.badge', 2)
  await waitData(page, 'tabs.1.badge', 2)
  await snap(mini, 'supplier-home')
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
  await page.callMethod('load')
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
  await waitData(page, 'editable', false)
  expect(await page.data('inviteView.lines')).toMatchObject([
    { qty: 70, priceCents: 350, headMeta: '需求 70 枝', subText: '供 70 枝 × ¥3.50' },
  ])
  expect((await inviteOf(s)).version).toBeGreaterThan(edited.version)
  await snap(mini, 'supplier-submitted')
})

test('F03 B12-F 供应商采购只读弹层及邀请卡片关联状态实时更新', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'p1')
  const po = await poOf(s, 'PO-260929-006')
  const page = await enter(mini, '/packages/supplier/pages/orders/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: po.id } } })
  await waitData(page, 'sheet', true)
  await waitData(page, 'view.info.title', po.no)
  const api = await s.as('u4')
  const changed = dataOf<PoDetail>(
    await api.put(`/purchase-orders/${po.id}`, {
      ...poInput(po),
      note: '临时补充',
      reason: '联系供应商',
    }),
  )
  await expect
    .poll(async () => page.data('view.info.rows') as Promise<unknown>)
    .toContainEqual({ label: '备注', value: '临时补充' })
  await snap(mini, 'supplier-purchase-detail')
  const list = await enter(mini, '/packages/supplier/pages/invites/index')
  await waitData(list, 'loaded', true)
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, {
      version: changed.version,
      reason: '客户取消订单',
    }),
  )
  await expect
    .poll(async () =>
      ((await list.data('rows')) as { meta: string }[]).some((r) => r.meta.includes('已取消')),
    )
    .toBe(true)
  await snap(mini, 'supplier-invites-cancelled')
})
