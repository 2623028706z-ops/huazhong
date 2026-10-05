import { copy, redesignCopy, type PoDetail } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { inviteOf, poInput, poOf } from '../support/purchase.ts'
import { dataOf, TODAY, TOMORROW } from '../support/sales.ts'
import {
  asMini,
  enter,
  pickOption,
  setupMiniSuite,
  snap,
  tapText,
  waitData,
  waitPage,
} from './mini.ts'

const suite = setupMiniSuite()

test('B01-F 采购首页只列入口、待办，一级页无返回', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const page = await enter(mini, '/packages/purchase/pages/home/index')
  const home = (await page.$('#module-home')) as CustomElement
  await expect.poll(async () => home.data('common') as Promise<unknown>).toHaveLength(2)
  expect(await home.data('back')).toBe(false)
  // 单模块员工没有底栏，「我的」放进资料组最后一格
  expect(await home.data('masters')).toMatchObject([{ key: 'suppliers' }, { key: 'my' }])
  // 待办：缺货花材、到货有差异（06 章 C1，第 3 批）；不放待填报邀请、待收货采购单
  await expect
    .poll(async () => home.data('todos') as Promise<unknown>)
    .toMatchObject([{ key: 'shortageMaterials' }, { key: 'poDiffs' }])
  expect(await home.data('tabs')).toEqual([])
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
  await waitData(page, 'loaded', true)
  // 出货日期收进筛选（06 章 C2）：自定义区间
  const range = (from: string, to: string) => ({
    detail: { status: '', keyword: '', date: 'custom', range: { from, to }, picks: {} },
  })
  await page.callMethod('onDemandFilter', range(TODAY, TOMORROW))
  await waitData(page, 'from', TODAY)
  await expect.poll(async () => page.data('rows') as Promise<unknown>).not.toEqual([])
  const rows = (await page.data('rows')) as { id: string; name: string }[]
  const sunflower = rows.find((r) => r.name === '向日葵')?.id
  if (!sunflower) throw new Error('no demand')
  const event = { currentTarget: { dataset: { key: sunflower } } }
  await page.callMethod('onSource', event)
  await waitData(page, 'sourceSheet', true)
  // 需求来源弹层：上面需求 / 库存 / 在途 / 缺口，下面「已邀请待填报」一段列邀请
  await expect
    .poll(async () => page.data('sourceSections.0.key') as Promise<unknown>)
    .toBe('invites')
  expect(await page.data('sourceSections.0.blocks')).toHaveLength(1)
  expect(
    ((await page.data('sourceTop')) as { value: string }[]).map((field) => field.value),
  ).toEqual(['75 枝', '60 枝', '0 枝', '15 枝'])
  await snap(mini, 'demand-sources')
  const invite = await inviteOf(s)
  await page.callMethod('onOpenBlock', {
    currentTarget: { dataset: { key: invite.id, kind: 'invite' } },
  })
  const inviteDetail = await waitPage(mini, 'packages/purchase/pages/invite-detail/index')
  await waitData(inviteDetail, 'loaded', true)
  expect(await inviteDetail.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ label: copy.screen.inviteNo, value: invite.no }),
  )
  await mini.navigateBack()
  await waitPage(mini, 'packages/purchase/pages/demand/index')
  await page.callMethod('onCloseSource')
  await page.callMethod('onToggle', event)
  expect(await page.callMethod('draft')).toMatchObject({ lines: [{ qty: 15 }] })
  // 邀请供应商直接进 C7，供应商在 C7 里选；「全选」再点一次全不选
  await page.callMethod('onToggle', event)
  expect(await page.data('selected')).toEqual([])
  await page.callMethod('onSelectAll')
  expect(await page.data('allSelected')).toBe(true)
  await page.callMethod('onSelectAll')
  expect(await page.data('selected')).toEqual([])
  await page.callMethod('onToggle', event)
  await page.callMethod('onInvite')
  const form = await waitPage(mini, 'packages/purchase/pages/invite-form/index')
  await waitData(form, 'loaded', true)
  await expect
    .poll(async () => form.data('form.lines') as Promise<unknown>)
    .toMatchObject([{ qty: 15, stockQty: 60 }])
  const options = (await form.data('supplierOptions')) as { id: string }[]
  await pickOption(form, '#supplier-picker', options[0]?.id ?? '')
  await snap(mini, 'invite-create')
  await tapText(form, copy.screen.action.sendInvite)
  await waitData(form, 'reviewSheet', true)
  await form.callMethod('onReviewConfirm')
  // 新建发出后换到 C3 的填报邀请段（06 章 C7）；返回回到需求页
  const sent = await waitPage(mini, 'packages/purchase/pages/orders/index')
  expect(await sent.data('segment')).toBe('invites')
  await mini.navigateBack()
  await waitPage(mini, 'packages/purchase/pages/demand/index')
  await waitData(page, 'selected', [])
  await page.callMethod('onDemandFilter', range(TODAY, '2026-09-28'))
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

test('B12-F B28-F G04-F I01 填报整页分享、修改返回与采购关联状态', async () => {
  const { mini, server: s } = suite()
  const api = await asMini(mini, s, 'u4')
  const invite = await inviteOf(s)
  const page = await enter(mini, `/packages/purchase/pages/invite-detail/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  await waitData(page, 'view.info.title', invite.supplierName)
  await snap(mini, 'invite-detail-pending')
  await expect.poll(async () => page.data('share.path') as Promise<unknown>).toContain('sig=')
  await snap(mini, 'invite-share')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'editInvite' } } })
  const edit = await waitPage(mini, 'packages/purchase/pages/invite-form/index')
  await waitData(edit, 'loaded', true)
  await edit.callMethod('onQty', { detail: { index: 0, qty: 70 } })
  await edit.callMethod('onSubmit')
  await expect.poll(async () => (await mini.currentPage())?.path).toBe(page.path)
  await waitData(page, 'loaded', true)
  await waitData(page, 'view.lines.0.qty', 70)
  const po = await poOf(s, 'PO-260929-006')
  dataOf(
    await api.post(`/purchase-orders/${po.id}/cancel`, {
      version: po.version,
      reason: '客户取消订单',
    }),
  )
  const submitted = await inviteOf(s, 'YQ-260928-001')
  const detail = await enter(
    mini,
    `/packages/purchase/pages/invite-detail/index?id=${submitted.id}`,
  )
  // 采购单放在信息卡「采购单」一行，值不再带前缀
  await waitData(detail, 'view.poLink', `${po.no}${copy.separator}已取消`)
  expect(await detail.data('view.info.status')).toBe('submitted')
  expect(await detail.data('buttons')).toEqual([])
  await snap(mini, 'invite-submitted-cancelled')
})

test('C9 取消邀请留在整页，确认取消后保留取消说明和完整日期', async () => {
  const { mini, server: s } = suite()
  await asMini(mini, s, 'u4')
  const invite = await inviteOf(s)
  const page = await enter(mini, `/packages/purchase/pages/invite-detail/index?id=${invite.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'cancelInvite' } } })
  const confirm = (await page.$('#hz-confirm')) as CustomElement
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await confirm.callMethod('onConfirm')
  await waitData(page, 'view.info.status', 'cancelled')
  expect((await mini.currentPage())?.path).toBe(page.path)
  expect(await page.data('buttons')).toEqual([])
  expect(await page.data('view.reason.rows')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: '取消原因' }),
      expect.objectContaining({ label: '取消时间' }),
    ]),
  )
  expect(await page.data('view.progress.1')).toMatchObject({ label: '已取消', state: 'ended' })
  await snap(mini, 'invite-cancelled-page')
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
  const table = (await page.$('components\\/hz-line-item\\/index')) as CustomElement
  await expect.poll(async () => table.data('totalAmount') as Promise<unknown>).toBe('¥2,414.00')
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
    .toContainEqual(expect.objectContaining({ label: '备注', value: '补充备注' }))
})

test('C4 到货差异黄条：仓库改价后采购员看到差在哪，点「知道了」收起', async () => {
  const { mini, server: s } = suite()
  const po = await poOf(s, 'PO-260928-004')
  dataOf(
    await (
      await s.as('u5')
    ).post(`/purchase-orders/${po.id}/reprice`, {
      version: po.version,
      reason: '',
      lines: po.lines.map((line) => ({ poLineId: line.id, priceCents: line.priceCents - 50 })),
    }),
  )
  const api = await asMini(mini, s, 'u4')
  const page = await enter(mini, `/packages/purchase/pages/order-detail/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await waitData(page, 'view.diff.action', redesignCopy.gotIt)
  expect(JSON.stringify(await page.data('view.diff.lines'))).toContain(po.lines[0]?.name ?? '-')
  await snap(mini, 'purchase-diff-notice')
  await page.callMethod('onAckDiff')
  // 点过就整条收起（data 里读回来是空）
  await expect.poll(async () => page.data('view.diff') as Promise<unknown>).toBeFalsy()
  expect(dataOf<PoDetail>(await api.get(`/purchase-orders/${po.id}`)).diff?.unseen).toBe(false)
})
