import type { PoDetail } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { inviteOf, poInput, poOf } from '../support/purchase.ts'
import { dataOf, TODAY, TOMORROW } from '../support/sales.ts'
import { asMini, enter, setupMiniSuite, snap, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('B01-F 采购首页只列入口、待办，一级页无返回', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const page = await enter(mini, '/packages/purchase/pages/home/index')
  const home = (await page.$('#module-home')) as CustomElement
  await expect.poll(async () => home.data('person') as Promise<unknown>).toBe('周宁')
  expect(await home.data('back')).toBe(false)
  expect(await home.data('entries')).toHaveLength(4)
  expect(await home.data('todoCount')).toBe(1)
  await snap(mini, 'purchase-home')
})

test('B10-F 手工采购可换供应商，填报采购供应商只读', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const supply = await poOf(s, 'PO-260929-006')
  const page = await enter(mini, `/packages/purchase/pages/order-form/index?id=${supply.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('canChangeSupplier')).toBe(false)
  expect(await page.$('#supplier-picker')).toBeNull()
  await snap(mini, 'purchase-edit-supply')
  const manual = await poOf(s)
  const other = await enter(mini, `/packages/purchase/pages/order-form/index?id=${manual.id}`)
  await waitData(other, 'loaded', true)
  expect(await other.data('canChangeSupplier')).toBe(true)
  expect(await other.$('#supplier-picker')).not.toBeNull()
})

test('B21 B24-F B25-F G11 需求来源、缺口预填和日期校验', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const page = await enter(mini, '/packages/purchase/pages/demand/index')
  await page.callMethod('onFrom', { detail: TODAY })
  await page.callMethod('onTo', { detail: TOMORROW })
  await page.callMethod('load')
  await waitData(page, 'loaded', true)
  await expect.poll(async () => page.data('rows') as Promise<unknown>).not.toEqual([])
  const rows = (await page.data('rows')) as { id: string; name: string }[]
  const sunflower = rows.find((r) => r.name === '向日葵')?.id
  if (!sunflower) throw new Error('no demand')
  const event = { currentTarget: { dataset: { key: sunflower } } }
  await page.callMethod('onSource', event)
  await expect.poll(async () => page.data('source.invites') as Promise<unknown>).toHaveLength(1)
  expect(await page.data('sourceSummary')).toBe('需求 75 · 库存 60 · 在途 0')
  expect(await page.data('sourceLeft')).toBe('缺 15')
  expect(await page.data('source.invites')).toHaveLength(1)
  await snap(mini, 'demand-sources')
  await page.callMethod('onCloseSource')
  await page.callMethod('onToggle', event)
  expect(await page.callMethod('draft')).toMatchObject({ lines: [{ qty: 15 }] })
  await page.callMethod('onInvite')
  await expect.poll(async () => page.data('suppliers') as Promise<unknown>).not.toEqual([])
  await page.callMethod('onNext')
  expect(await page.data('error')).toBe('请选择一家供应商')
  const suppliers = (await page.data('suppliers')) as { id: string }[]
  await page.callMethod('onSupplier', { detail: suppliers[0]?.id })
  await page.callMethod('onNext')
  const form = await waitPage(mini, 'packages/purchase/pages/invite-form/index')
  await waitData(form, 'loaded', true)
  await expect
    .poll(async () => form.data('form.lines') as Promise<unknown>)
    .toMatchObject([{ qty: 15, stockQty: 60 }])
  await snap(mini, 'invite-create')
  await mini.navigateBack()
  await waitData(page, 'selected', [])
  await page.callMethod('onTo', { detail: '2026-09-28' })
  await waitData(page, 'dateError', '结束日期不能早于开始日期')
})

test('G08 G09 采购错误标字段、输入清错、返回可继续填写', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const po = await poOf(s)
  await enter(mini, `/packages/purchase/pages/order-detail/index?id=${po.id}`)
  await mini.navigateTo(`/packages/purchase/pages/order-form/index?id=${po.id}`)
  const page = await waitPage(mini, 'packages/purchase/pages/order-form/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onQty', { detail: { index: 1, qty: 0 } })
  await page.callMethod('onSubmit')
  await waitData(page, 'lineViews.1.qtyError', '采购数量须为大于 0 的整数')
  expect(await page.data('lineViews.0.qtyError')).toBe('')
  await snap(mini, 'purchase-field-error')
  await page.callMethod('onQty', { detail: { index: 1, qty: 25 } })
  expect(await page.data('formError')).toBe('')
  expect(await page.data('lineViews.1.qtyError')).toBe('')
  const nav = (await page.$('#page-nav')) as CustomElement
  await nav.callMethod('onBack')
  const confirm = (await page.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await snap(mini, 'purchase-discard')
  await confirm.callMethod('onCancel')
  expect(await page.data('form.lines.1.qty')).toBe(25)
  await nav.callMethod('onBack')
  await confirm.callMethod('onConfirm')
  await expect
    .poll(async () => (await mini.currentPage())?.path)
    .toBe('packages/purchase/pages/order-detail/index')
})

test('B12-F B28-F G04-F I01 邀请弹层切换、修改返回重开、关联状态', async () => {
  const { mini, server: s } = suite()
  const api = await asMini(mini, s, 'u4')
  const invite = await inviteOf(s)
  const page = await enter(mini, '/packages/purchase/pages/invites/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('open', invite.id)
  await waitData(page, 'view.info.title', invite.no)
  await snap(mini, 'invite-detail-pending')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'shareInvite' } } })
  await waitData(page, 'sheet', 'share')
  await expect.poll(async () => page.data('share.path') as Promise<unknown>).toContain('sig=')
  await snap(mini, 'invite-share')
  await page.callMethod('onBackSheet')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'editInvite' } } })
  const edit = await waitPage(mini, 'packages/purchase/pages/invite-form/index')
  await waitData(edit, 'loaded', true)
  await edit.callMethod('onQty', { detail: { index: 0, qty: 70 } })
  await edit.callMethod('onSubmit')
  await expect.poll(async () => (await mini.currentPage())?.path).toBe(page.path)
  await waitData(page, 'sheet', 'detail')
  await waitData(page, 'view.lines.0.qty', 70)
  const po = await poOf(s, 'PO-260929-006')
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, {
      version: po.version,
      reason: '客户取消订单',
    }),
  )
  const submitted = await inviteOf(s, 'YQ-260928-001')
  await page.callMethod('open', submitted.id)
  await waitData(page, 'view.poLink', `采购单 ${po.no} · 已取消`)
  expect(await page.data('view.info.status')).toBe('submitted')
  expect(await page.data('buttons')).toEqual([])
  await snap(mini, 'invite-submitted-cancelled')
})

test('阶段 4 单行采购修改保留原因但不重复合计', async () => {
  const { mini, server: s } = suite()
  const api = await asMini(mini, s, 'u4')
  const source = await poOf(s)
  const po = dataOf<PoDetail>(
    await api.post('/purchase-orders', {
      supplierId: source.supplierId,
      note: '',
      lines: [poInput(source).lines[0]],
    }),
  )
  const page = await enter(mini, `/packages/purchase/pages/order-form/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('lineViews')).toHaveLength(1)
  expect(await page.$$('.u-sheet-row')).toHaveLength(0)
  await snap(mini, 'purchase-edit-single')
})

test('B07 H02 收货输入受保护，查看最新数量后按最新单收货', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u5')
  const po = await poOf(s, 'PO-260929-006')
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onQty', { detail: { index: 0, qty: 170 } })
  await page.callMethod('onRecvNote', { detail: '现场核对' })
  await waitData(page, 'changed', true)
  const api = await s.as('u4')
  dataOf<PoDetail>(
    await api.put(`/purchase-orders/${po.id}`, {
      ...poInput(po),
      lines: poInput(po).lines.map((l) => ({ ...l, qty: 180 })),
      reason: '只能供 180 枝',
    }),
  )
  await expect.poll(async () => page.data('realtime') as Promise<unknown>).toContain('刚被修改')
  expect(await page.data('lines.0.qty')).toBe(170)
  await page.callMethod('onRealtime')
  await waitData(page, 'lines.0.qty', 180)
  expect(await page.data('recvNote')).toBe('现场核对')
  await page.callMethod('onQty', { detail: { index: 0, qty: 170 } })
  expect(await page.data('lineViews.0.tags')).toEqual([{ text: '少收 10', warn: true }])
  await snap(mini, 'warehouse-receive')
  await page.callMethod('onReceive')
  await waitData(page, 'receiving', false)
  expect(await page.data('view.info.status')).toBe('received')
  expect(await page.data('view.amountRows')).toContainEqual({ label: '应付', value: '¥2,414.00' })
})

test('H07 收货页断线期间改单，重新连接后刷新', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u5')
  const po = await poOf(s)
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await mini.evaluate('function () { getApp().onHide() }')
  dataOf(
    await (
      await s.as('u4')
    ).put(`/purchase-orders/${po.id}`, { ...poInput(po), note: '补充备注', reason: '核对交货' }),
  )
  await mini.evaluate('function () { getApp().onShow() }')
  await expect
    .poll(async () => page.data('view.info.rows') as Promise<unknown>)
    .toContainEqual({ label: '备注', value: '补充备注' })
})
