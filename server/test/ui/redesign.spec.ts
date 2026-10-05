import { copy, redesignCopy, type OrderDetail, type StatementDetail } from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { dataOf, idBy, TOMORROW } from '../support/sales.ts'
import { asMini, enter, setupMiniSuite, snap, tapText, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('X3 「确认」弹层只选出货日期，确认后留在详情', async () => {
  const { mini, server } = suite()
  const sales = await asMini(mini, server, 'u2')
  const id = await idBy(server.t, 'orders.no', 'SO-260929-018')
  const detail = await enter(mini, `/packages/sales/pages/order-detail/index?id=${id}`)
  await waitData(detail, 'loaded', true)
  await detail.callMethod('onAction', { currentTarget: { dataset: { code: 'confirm' } } })
  await waitData(detail, 'confirmSheet', true)
  const sheet = (await detail.$(
    'packages\\/sales\\/components\\/hz-order-confirm\\/index',
  )) as CustomElement
  await expect.poll(async () => sheet.data('rows') as Promise<unknown>).toHaveLength(1)
  await sheet.callMethod('onDate', { detail: TOMORROW })
  await snap(mini, 'redesign-confirm-sheet')
  await sheet.callMethod('onConfirm')
  await waitData(detail, 'confirmSheet', false)
  expect((await mini.currentPage())?.path).toBe('packages/sales/pages/order-detail/index')
  expect(dataOf<OrderDetail>(await sales.get(`/orders/${id}`))).toMatchObject({
    status: 'to_ship',
    shipDate: TOMORROW,
  })
  await waitData(detail, 'view.info.status', 'to_ship')
})

test('X3 「修改后确认」进整页，日期备注变化不要求原因，加载明细不弹编辑窗口', async () => {
  const { mini, server } = suite()
  const sales = await asMini(mini, server, 'u2')
  const id = await idBy(server.t, 'orders.no', 'SO-260929-018')
  const detail = await enter(mini, `/packages/sales/pages/order-detail/index?id=${id}`)
  await waitData(detail, 'loaded', true)
  // 灰字「修改后确认」在底栏，和「确认」同属确认权限
  expect(await detail.data('buttons')).toContainEqual(
    expect.objectContaining({ code: 'confirmEdit', text: redesignCopy.confirmWithEdit }),
  )
  await detail.callMethod('onAction', { currentTarget: { dataset: { code: 'confirmEdit' } } })
  const form = await waitPage(mini, 'packages/sales/pages/order-form/index')
  await waitData(form, 'loaded', true)
  expect(await form.data('mode')).toBe('confirm')
  const lines = (await form.$('components\\/hz-line-item\\/index')) as CustomElement
  expect(await lines.data('showEditor')).toBe(false)
  expect(await lines.data('totalQty')).not.toBe('')
  await form.callMethod('onShipDate', { detail: TOMORROW })
  await form.callMethod('onNote', { detail: '上午送到' })
  expect(await form.data('linesChanged')).toBe(false)
  await snap(mini, 'redesign-confirm-order')
  await tapText(form, copy.screen.action.confirm)
  await waitPage(mini, 'packages/sales/pages/order-detail/index')
  expect(dataOf<OrderDetail>(await sales.get(`/orders/${id}`))).toMatchObject({
    status: 'to_ship',
    shipDate: TOMORROW,
    note: '上午送到',
  })
})

test('F14 内部所属DZ只读，S11只展示本店，无财务写入口', async () => {
  const { mini, server } = suite()
  const id = await idBy(server.t, 'orders.no', 'SO-260927-021')
  const sales = await asMini(mini, server, 'u2')
  const order = dataOf<OrderDetail>(await sales.get(`/orders/${id}`))
  if (!order.statement) throw new Error('expected seed DZ')
  const orderPage = await enter(mini, `/packages/sales/pages/order-detail/index?id=${id}`)
  await waitData(orderPage, 'loaded', true)
  const rows = (await orderPage.data('view.info.rows')) as { label: string; url?: string }[]
  const link = rows.find((row) => row.label === '对账单')?.url
  expect(link).toBe(
    `/packages/finance/pages/statement-detail/index?scope=internal&id=${order.statement.id}`,
  )
  const info = (await orderPage.$('components\\/hz-info-rows\\/index')) as CustomElement
  await info.callMethod('onLink', { currentTarget: { dataset: { url: link } } })
  const internal = await waitPage(mini, 'packages/finance/pages/statement-detail/index')
  await waitData(internal, 'loaded', true)
  expect(await internal.data('canShare')).toBe(false)
  expect(await internal.data('canRegister')).toBe(false)
  expect(await internal.data('canVoid')).toBe(false)
  expect(
    dataOf<StatementDetail>(await sales.get(`/statements/${order.statement.id}`)).actions,
  ).toEqual([])
  await asMini(mini, server, 's1')
  const storeOrder = await enter(mini, `/packages/store/pages/order-detail/index?id=${id}`)
  await waitData(storeOrder, 'loaded', true)
  const storeRows = (await storeOrder.data('view.info.rows')) as { label: string; url?: string }[]
  const storeLink = storeRows.find((row) => row.label === '对账单')?.url
  expect(storeLink).toBe(`/packages/store/pages/statement-detail/index?id=${order.statement.id}`)
  const storeInfo = (await storeOrder.$('components\\/hz-info-rows\\/index')) as CustomElement
  await storeInfo.callMethod('onLink', { currentTarget: { dataset: { url: storeLink } } })
  const store = await waitPage(mini, 'packages/store/pages/statement-detail/index')
  await waitData(store, 'loaded', true)
  const rendered = JSON.stringify(await store.data('view'))
  expect(rendered).toContain('滨江店')
  expect(rendered).not.toContain('城西店')
  expect(rendered).not.toContain('抵扣多收')
  await snap(mini, 'redesign-store-statement')
})

test('H4/F15 从真实单据生成完整图片，送货单不授财务权限', async () => {
  const { mini, server } = suite()
  const shipping = await asMini(mini, server, 'u7')
  const id = await idBy(server.t, 'orders.no', 'SO-260927-021')
  const delivery = await enter(mini, `/packages/shipping/pages/delivery/index?id=${id}`)
  await expect.poll(async () => delivery.data('image') as Promise<unknown>).toMatch(/\S+/)
  expect((await delivery.data()) as unknown).toMatchObject({
    failure: null,
  })
  await snap(mini, 'redesign-delivery-image')
  const finance = await asMini(mini, server, 'u6')
  const statements = dataOf<{ items: { id: string; no: string }[] }>(
    await finance.get('/finance/statements?kind=customer'),
  )
  const statement = statements.items.find((item) => item.no === 'DZ-260929-001')
  if (!statement) throw new Error('expected seed DZ')
  expect((await shipping.get(`/statements/${statement.id}`)).status).toBe(403)
  const image = await enter(
    mini,
    `/packages/finance/pages/statement-image/index?id=${statement.id}`,
  )
  await expect.poll(async () => image.data('image') as Promise<unknown>).toMatch(/\S+/)
  expect(await image.data('error')).toBe('')
  await snap(mini, 'redesign-statement-image')
})

test('H2 批量发货后弹结果层，点已发出的一行进送货单，返回弹层还在', async () => {
  const { mini, server } = suite()
  const shipping = await asMini(mini, server, 'u7')
  type Cards = { items: { id: string }[] }
  const before = dataOf<Cards>(await shipping.get('/shipping/orders?status=to_ship')).items
  expect(before.length).toBeGreaterThan(0)
  const page = await enter(mini, '/packages/shipping/pages/list/index')
  await waitData(page, 'loaded', true)
  // 不带状态进来默认待发货
  expect(await page.data('filter.status')).toBe('to_ship')
  await page.callMethod('onSelectAll')
  await waitData(
    page,
    'selected',
    before.map(({ id }) => expect.objectContaining({ id }) as unknown),
  )
  await page.callMethod('onConfirmBatch')
  await waitData(page, 'result', true)
  const left = new Set(
    dataOf<Cards>(await shipping.get('/shipping/orders?status=to_ship')).items.map(({ id }) => id),
  )
  const shipped = before.filter(({ id }) => !left.has(id))
  expect(shipped.length).toBeGreaterThan(0)
  expect(await page.data('resultHead')).toBe(
    copy.flow.ship.resultHead(shipped.length, before.length - shipped.length),
  )
  const rows = (await page.data('resultRows')) as { id: string; failed: boolean }[]
  expect(rows.filter((row) => !row.failed).map((row) => row.id)).toEqual(
    expect.arrayContaining(shipped.map(({ id }) => id)),
  )
  await snap(mini, 'redesign-batch-ship-result')
  await page.callMethod('onResultRow', { currentTarget: { dataset: { key: shipped[0]?.id } } })
  await waitPage(mini, 'packages/shipping/pages/delivery/index')
  await mini.navigateBack()
  await waitPage(mini, 'packages/shipping/pages/list/index')
  expect(await page.data('result')).toBe(true)
  await page.callMethod('onCloseResult')
  await waitData(page, 'result', false)
})

test('S3 门店底栏「订单」角标和段名数字来自没看过的结果（取消申请被拒绝）', async () => {
  const { mini, server } = suite()
  const sales = await server.as('u2')
  const order = dataOf<OrderDetail>(
    await sales.get(`/orders/${await idBy(server.t, 'orders.no', 'SO-260929-018')}`),
  )
  dataOf(
    await sales.post('/orders/batch-confirm', {
      orders: [{ id: order.id, version: order.version }],
      shipDate: TOMORROW,
    }),
  )
  // 门店申请取消、销售拒绝：取消申请有了结果，门店还没看过（03 章第 8.5 节）
  const storeApi = await server.as('s1')
  const toShip = dataOf<OrderDetail>(await sales.get(`/orders/${order.id}`))
  const requested = dataOf<OrderDetail>(
    await storeApi.post(`/store/orders/${order.id}/cancel-request`, {
      version: toShip.version,
      reason: '临时不要了',
    }),
  )
  dataOf(
    await sales.post(`/orders/${order.id}/cancel-request/reject`, {
      version: requested.version,
      reason: '花材已备好',
    }),
  )
  const store = await asMini(mini, server, 's1')
  const unseen = dataOf<{ total: number; orders: number; afters: number }>(
    await store.get('/store/unseen'),
  )
  expect(unseen.orders).toBeGreaterThan(0)
  const page = await enter(mini, '/packages/store/pages/orders/index')
  await waitData(page, 'loaded', true)
  await expect
    .poll(async () => page.data('tabs') as Promise<unknown>)
    .toContainEqual(expect.objectContaining({ key: 'orders', badge: unseen.total }))
  expect(await page.data('segmentCounts')).toEqual({
    orders: unseen.orders,
    afters: unseen.afters,
  })
  await snap(mini, 'redesign-store-tab-badge')
})
