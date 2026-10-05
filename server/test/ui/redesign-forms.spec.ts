import {
  contract,
  copy,
  redesignCopy,
  type Catalog,
  type CustomerItem,
  type Supplier,
  type AfterDetail,
} from '@huazhong/shared'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { expect, test } from 'vitest'
import { dataOf } from '../support/sales.ts'
import { poOf } from '../support/purchase.ts'
import { asMini, enter, setupMiniSuite, snap, tapText, waitData, waitPage } from './mini.ts'

const suite = setupMiniSuite()

test('X12/X13/X14 门店整页保存；订货目录从其他客户复制，产品整页改价，配方加载不弹窗口', async () => {
  const { mini, server } = suite()
  const sales = await asMini(mini, server, 'u2')
  const customer = dataOf<CustomerItem>(
    await sales.post('/customers', { name: '整页验收客户', enabled: true }),
  )
  dataOf(await sales.post(`/catalog/${customer.id}/categories`, { name: '日常' }))
  const customers = await enter(mini, '/packages/sales/pages/customers/index')
  await waitData(customers, 'loaded', true)
  await customers.callMethod('onCustomer', { detail: customer.id })
  await customers.callMethod('onEditCustomer')
  // 「修改客户」收在底栏「更多」里，打开客户资料弹层；没改动（guard 绑 customerChanged）直接关
  await waitData(customers, 'customerSheet', true)
  expect(await customers.data('editingCustomer')).toBe(true)
  expect(await customers.data('customerChanged')).toBe(false)
  await customers.callMethod('onCloseSheet')
  await waitData(customers, 'customerSheet', false)
  await customers.callMethod('onNewStore')
  const store = await waitPage(mini, 'packages/sales/pages/store-form/index')
  await waitData(store, 'loaded', true)
  await store.callMethod('patchStore', {
    currentTarget: { dataset: { field: 'name' } },
    detail: '验收门店',
  })
  await snap(mini, 'redesign-store-full-page')
  await store.callMethod('onSaveStore')
  await waitPage(mini, customers.path)
  await waitData(customers, 'stores.0.name', '验收门店')
  const list = await enter(mini, '/packages/sales/pages/catalog/index')
  await waitData(list, 'loaded', true)
  await list.callMethod('onCustomer', { detail: customer.id })
  await waitData(list, 'customerId', customer.id)
  await list.callMethod('onCopy')
  const picker = await waitPage(mini, 'packages/sales/pages/catalog-copy/index')
  await waitData(picker, 'loaded', true)
  const rows = (await picker.data('rows')) as { id: string; disabled: boolean }[]
  const source = rows.find((row) => !row.disabled)
  expect(source).toBeDefined()
  await picker.callMethod('onPick', { currentTarget: { dataset: { key: source?.id } } })
  await snap(mini, 'redesign-catalog-picker')
  await picker.callMethod('onCopy')
  await waitPage(mini, list.path)
  const copied = dataOf<Catalog>(await sales.get(`/catalog/${customer.id}`)).items
  expect(copied).toHaveLength(1)
  const id = copied[0]?.productId
  await list.callMethod('onOpenItem', { currentTarget: { dataset: { key: id } } })
  const item = await waitPage(mini, 'packages/sales/pages/catalog-item/index')
  await waitData(item, 'loaded', true)
  expect(await item.data('pickSheet')).toBe(false)
  expect(((await item.data('form.bom')) as unknown[]).length).toBeGreaterThan(0)
  await item.callMethod('onPrice', { detail: '9.00' })
  await snap(mini, 'redesign-catalog-full-page')
  await item.callMethod('onSave')
  await waitPage(mini, list.path)
  const catalog = dataOf<Catalog>(await sales.get(`/catalog/${customer.id}`))
  expect(catalog.items).toMatchObject([{ productId: id, listPriceCents: 900, customerCode: '' }])
})

test('C10 供应商资料整页保存，账号手机号错误在字段显示', async () => {
  const { mini, server } = suite()
  const purchase = await asMini(mini, server, 'u4')
  const list = await enter(mini, '/packages/purchase/pages/suppliers/index')
  await waitData(list, 'loaded', true)
  await list.callMethod('onCreate')
  const form = await waitPage(mini, 'packages/purchase/pages/supplier/index')
  await waitData(form, 'loaded', true)
  await form.callMethod('onText', {
    currentTarget: { dataset: { field: 'name' } },
    detail: '整页验收供应商',
  })
  await form.callMethod('onAccount', { detail: true })
  await form.callMethod('onLoginPhone', { detail: '12' })
  await form.callMethod('onSave')
  const invalid = (await form.data()) as { fields: Record<string, string> }
  expect(invalid.fields['account.loginPhone']).toMatch(/\S+/)
  await form.callMethod('onLoginPhone', { detail: '18812345678' })
  await snap(mini, 'redesign-supplier-full-page')
  await form.callMethod('onSave')
  await waitPage(mini, list.path)
  const suppliers = dataOf<{ items: Supplier[] }>(await purchase.get('/suppliers?q=整页验收供应商'))
  expect(suppliers.items).toMatchObject([{ name: '整页验收供应商', hasAccount: true }])
})

test('W3 拒收确认后全部实收为0，显示已拒收且不增加库存', async () => {
  const { mini, server } = suite()
  const warehouse = await asMini(mini, server, 'u5')
  const po = await poOf(server, 'PO-260929-006')
  const before = dataOf(await warehouse.get(contract.listInventory.path))
  const page = await enter(mini, `/packages/warehouse/pages/receive/index?id=${po.id}`)
  await waitData(page, 'loaded', true)
  await tapText(page, redesignCopy.rejectPurchaseConfirm)
  const confirm = (await page.$('#hz-confirm')) as CustomElement
  await waitData(page, 'busy', '')
  await expect.poll(async () => confirm.data('show') as Promise<unknown>).toBe(true)
  await tapText(confirm, redesignCopy.rejectPurchaseConfirm)
  await waitData(page, 'view.info.status', 'rejected')
  expect(dataOf(await warehouse.get(contract.listInventory.path))).toEqual(before)
  await snap(mini, 'redesign-rejected-po')
})

test('X15/X7 选择订单后替换为售后表单，小窗口校验单价和原因，新建无图片且说明选填', async () => {
  const { mini, server } = suite()
  const sales = await asMini(mini, server, 'u2')
  const list = await enter(mini, '/packages/sales/pages/afters/index')
  await waitData(list, 'loaded', true)
  await list.callMethod('onCreate')
  const picker = await waitPage(mini, 'packages/sales/pages/order-pick/index')
  await waitData(picker, 'loaded', true)
  // 只列能申请售后的已发货订单，点一张直接换成售后表单
  const rows = (await picker.data('rows')) as { id: string }[]
  const selected = rows[0]
  if (!selected) throw new Error('no afterable order')
  await picker.callMethod('onOpen', { currentTarget: { dataset: { key: selected.id } } })
  const form = await waitPage(mini, 'packages/sales/pages/after-form/index')
  await waitData(form, 'loaded', true)
  await form.callMethod('onOpenPick')
  const picks = (await form.data('picks')) as { id: string }[]
  await form.callMethod('onPickPlus', { currentTarget: { dataset: { key: picks[0]?.id } } })
  await form.callMethod('onPickConfirm')
  await waitData(form, 'editor', true)
  const originalPrice = (await form.data('draft.priceText')) as string
  await form.callMethod('onDraft', {
    currentTarget: { dataset: { field: 'priceText' } },
    detail: '',
  })
  await form.callMethod('onConfirmEditor')
  await waitData(form, 'editor', true)
  expect(await form.data('draftErrors.price')).toMatch(/\S+/)
  expect(await form.data('draftErrors.reason')).toMatch(/\S+/)
  await form.callMethod('onDraft', {
    currentTarget: { dataset: { field: 'priceText' } },
    detail: originalPrice,
  })
  await form.callMethod('onDraft', {
    currentTarget: { dataset: { field: 'reason' } },
    detail: 'other',
  })
  await snap(mini, 'redesign-after-editor')
  await form.callMethod('onConfirmEditor')
  await waitData(form, 'editor', false)
  const table = (await form.$('components\\/hz-line-item\\/index')) as CustomElement
  expect(await table.data('totalAmount')).not.toBe('')
  await form.callMethod('onSubmit')
  const detail = await waitPage(mini, 'packages/sales/pages/after-detail/index')
  await waitData(detail, 'loaded', true)
  const id = (await detail.data('view.info.rows')) as { label: string; value: string }[]
  const no = id.find((row) => row.label === '单号')?.value
  const afters = dataOf<{ items: AfterDetail[] }>(await sales.get('/afters?status=processed'))
  const created = afters.items.find((row) => row.no === no)
  if (!created) throw new Error('no created after')
  const after = dataOf<AfterDetail>(await sales.get(`/afters/${created.id}`))
  expect(after.lines[0]?.description).toBe('')
  expect(after.lines[0]?.images).toEqual([])
  expect(after.orderId).toBe(selected.id)
})

test('S12 门店售后段底栏「申请售后」选订单，点一张直接进申请表单', async () => {
  const { mini, server } = suite()
  const store = await asMini(mini, server, 's1')
  const afterable = dataOf<{ items: { id: string; no: string }[] }>(
    await store.get('/orders?afterable=true'),
  ).items
  const order = afterable[0]
  if (!order) throw new Error('no afterable store order')
  const list = await enter(mini, '/packages/store/pages/afters/index')
  await waitData(list, 'apply.text', copy.screen.action.applyAfter)
  await tapText(list, copy.screen.action.applyAfter)
  const picker = await waitPage(mini, 'packages/store/pages/order-pick/index')
  await waitData(picker, 'loaded', true)
  const rows = (await picker.data('rows')) as { id: string }[]
  expect(rows.map((row) => row.id)).toEqual(afterable.map((row) => row.id))
  await snap(mini, 'store-order-pick')
  await picker.callMethod('onOpen', { currentTarget: { dataset: { key: order.id } } })
  const form = await waitPage(mini, 'packages/store/pages/after-form/index')
  await waitData(form, 'loaded', true)
  expect(await form.data('info')).toContainEqual(
    expect.objectContaining({ label: copy.screen.label.sourceOrder, value: order.no }),
  )
  // 换成表单页（redirectTo），返回直接回售后列表
  await mini.navigateBack()
  await waitPage(mini, 'packages/store/pages/afters/index')
})
