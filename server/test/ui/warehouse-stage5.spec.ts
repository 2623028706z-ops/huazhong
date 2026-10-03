import { copy, type contract, type OutputOf, type WhDocDetail } from '@huazhong/shared'
import { expect, test } from 'vitest'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { emptyFilter } from '../../../miniapp/miniprogram/core/filter.ts'
import { dataOf, idBy, TODAY } from '../support/sales.ts'
import { stockQtyOf, whDocOf, whIds } from '../support/warehouse.ts'
import {
  asMini,
  enter,
  inputField,
  pickOption,
  setupMiniSuite,
  snap,
  tapText,
  waitData,
  waitPage,
} from './mini.ts'

const suite = setupMiniSuite()
const warehouse = '/packages/warehouse/pages'

test('C11: empty manual inbound list, create, return, filter, details, reprice and void', async () => {
  const { mini, server } = suite()
  await asMini(mini, server, 'u5')
  const ids = await whIds(server)
  let page = await enter(mini, `${warehouse}/docs/index?kind=in`)
  await waitData(page, 'loaded', true)
  expect(await page.data('rows')).toEqual([])
  await snap(mini, 'stock-in-empty')
  await tapText(page, copy.stock.screen.create.in)
  page = await waitPage(mini, 'packages/warehouse/pages/doc-form/index')
  await waitData(page, 'loaded', true)
  await pickOption(page, '#doc-supplier', ids.supplierId)
  const add = await page.$('#add-material')
  if (!add) throw new Error('no add material control')
  await (await add.$('.hz-add-button'))?.tap()
  await waitData(page, 'pickSheet', true)
  await page.callMethod('onPick', { currentTarget: { dataset: { key: ids.materialId } } })
  await page.callMethod('onQty', { detail: { index: 0, qty: 5 } })
  await page.callMethod('onPrice', { detail: { index: 0, text: '2.00' } })
  await inputField(page, '#doc-reason', '临时采购')
  await snap(mini, 'stock-in-form')
  await tapText(page, copy.stock.screen.submit.in)
  page = await waitPage(mini, 'packages/warehouse/pages/docs/index')
  await expect.poll(async () => ((await page.data('rows')) as unknown[]).length).toBe(1)
  const rows = (await page.data('rows')) as { id: string; amount: number }[]
  expect(rows[0]?.amount).toBe(1000)
  await page.callMethod('onFilter', { detail: { ...emptyFilter, status: 'voided' } })
  await waitData(page, 'rows', [])
  await page.callMethod('onFilter', { detail: emptyFilter })
  await expect.poll(async () => ((await page.data('rows')) as unknown[]).length).toBe(1)
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: rows[0]?.id } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.notice')).toBe('')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'reprice' } } })
  await page.callMethod('onPrice', { detail: { index: 0, text: '3.00' } })
  await page.callMethod('onSave')
  await waitData(page, 'fields.reason', copy.finance.repriceReason)
  await page.callMethod('onReason', { detail: '供应商调整报价' })
  await page.callMethod('onSave')
  await waitData(page, 'sheet', '')
  expect(await page.data('view.amountRows')).toContainEqual({
    label: copy.stock.screen.amount,
    value: '¥15.00',
  })
  await snap(mini, 'stock-in-repriced')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'void' } } })
  await page.callMethod('onReason', { detail: '重复录入' })
  await page.callMethod('onSave')
  await waitData(page, 'view.info.status', 'voided')
  expect(await page.data('buttons')).toEqual([])
})

test('C12-F/C20-F/C21: material shortcut, category management preserves quantity draft, save returns to list', async () => {
  const { mini, server } = suite()
  const api = await asMini(mini, server, 'u5')
  const materialId = await idBy(server.t, 'materials.name', '尤加利'),
    ids = await whIds(server)
  const before = await stockQtyOf(server, materialId)
  let page = await enter(mini, `${warehouse}/material/index?id=${materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'stockOut' } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-form/index')
  await waitData(page, 'loaded', true)
  await waitData(page, 'form.lines.0.materialId', materialId)
  await page.callMethod('onQty', { detail: { index: 0, qty: 2 } })
  await page.callMethod('onSubmit')
  await waitData(page, 'fields.outCategoryId', copy.stock.outCategoryRequired)
  await tapText(page, copy.screen.action.manageCategories)
  const categories = await waitPage(mini, 'packages/warehouse/pages/out-categories/index')
  await waitData(categories, 'loaded', true)
  await tapText(categories, copy.screen.action.addCategory)
  await waitData(categories, 'sheet', true)
  await inputField(categories, '#category-name', '活动布置')
  await waitData(categories, 'form.name', '活动布置')
  await categories.callMethod('onSave')
  await waitData(categories, 'sheet', false)
  const sampleId = await idBy(server.t, 'out_categories.name', '样品')
  await categories.callMethod('onEdit', { currentTarget: { dataset: { key: sampleId } } })
  await categories.callMethod('onEnabled', { detail: false })
  await categories.callMethod('onSave')
  await waitData(categories, 'sheet', false)
  await snap(mini, 'stock-out-categories')
  const navbar = await categories.$('#category-navbar')
  if (!navbar) throw new Error('no category navbar')
  await (await navbar.$('.hz-navbar__back'))?.tap()
  page = await waitPage(mini, 'packages/warehouse/pages/doc-form/index')
  await waitData(page, 'form.lines.0.qty', 2)
  await expect
    .poll(async () =>
      ((await page.data('categoryOptions')) as { name: string }[]).some(
        (row) => row.name === '活动布置',
      ),
    )
    .toBe(true)
  expect(await page.data('categoryOptions')).not.toContainEqual(
    expect.objectContaining({ id: sampleId }),
  )
  await pickOption(page, '#doc-category', ids.outCategoryId)
  await snap(mini, 'stock-out-form')
  await tapText(page, copy.stock.screen.submit.out)
  page = await waitPage(mini, 'packages/warehouse/pages/docs/index')
  await waitData(page, 'loaded', true)
  const docs = dataOf<OutputOf<typeof contract.listWhDocs>>(
    await api.get('/warehouse/docs?kind=out'),
  )
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: docs.items[0]?.id } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.info.rows')).toContainEqual({
    label: copy.stock.screen.outCategory,
    value: '生产领用',
  })
  expect(await stockQtyOf(server, materialId)).toBe(before - 2)
})

test('C15/C24: loss requires reason; saves without photos and original-batch void restores stock', async () => {
  const { mini, server } = suite()
  const api = await asMini(mini, server, 'u5'),
    ids = await whIds(server)
  const before = await stockQtyOf(server, ids.materialId)
  let page = await enter(mini, `${warehouse}/doc-form/index?kind=loss&materialId=${ids.materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onQty', { detail: { index: 0, qty: 5 } })
  await tapText(page, copy.stock.screen.submit.loss)
  await waitData(page, 'fields.reason', copy.stock.lossReasonRequired)
  await inputField(page, '#doc-reason', '花头发黑')
  await snap(mini, 'stock-loss-form')
  await tapText(page, copy.stock.screen.submit.loss)
  page = await waitPage(mini, 'packages/warehouse/pages/docs/index')
  await waitData(page, 'loaded', true)
  const docs = dataOf<OutputOf<typeof contract.listWhDocs>>(
    await api.get('/warehouse/docs?kind=loss'),
  )
  const lost = docs.items[0]
  if (!lost) throw new Error('no loss document')
  expect(await stockQtyOf(server, ids.materialId)).toBe(before - 5)
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: lost.id } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.images')).toEqual([])
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'void' } } })
  await page.callMethod('onReason', { detail: '报错品种' })
  await page.callMethod('onSave')
  await waitData(page, 'view.info.status', 'voided')
  expect(await stockQtyOf(server, ids.materialId)).toBe(before)
})

test('C13-F/C22-F: category selection, zero difference, stale preserves actual quantity and reason', async () => {
  const { mini, server } = suite()
  const api = await asMini(mini, server, 'u5'),
    ids = await whIds(server)
  const categoryIds = await Promise.all(
    ['玫瑰', '叶材'].map((name) => idBy(server.t, 'material_categories.name', name)),
  )
  let page = await enter(mini, `${warehouse}/stocktakes/index`)
  await waitData(page, 'loaded', true)
  await tapText(page, copy.stock.screen.create.stocktake)
  await waitData(page, 'sheet', true)
  await page.callMethod('onStart')
  await waitData(page, 'categoryError', copy.stock.categoriesRequired)
  for (const key of categoryIds)
    await page.callMethod('onCategory', { currentTarget: { dataset: { key } }, detail: true })
  await page.callMethod('onStart')
  page = await waitPage(mini, 'packages/warehouse/pages/stocktake-form/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onSubmit')
  page = await waitPage(mini, 'packages/warehouse/pages/stocktake-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('info.rows')).toContainEqual({
    label: copy.stock.screen.difference,
    value: copy.stock.screen.noDifference,
  })
  await snap(mini, 'stocktake-no-difference')
  page = await enter(mini, `${warehouse}/stocktake-form/index?categoryIds=${categoryIds.join(',')}`)
  await waitData(page, 'loaded', true)
  const first = (await page.data('form.lines.0')) as { materialId: string; bookQty: number }
  const actual = String(first.bookQty - 2)
  await page.callMethod('onActual', { currentTarget: { dataset: { index: 0 } }, detail: actual })
  await page.callMethod('onSubmit')
  await waitData(page, 'fields.reason', copy.stock.diffReasonRequired)
  await page.callMethod('onReason', { detail: '花材数量复核' })
  dataOf(
    await api.post('/warehouse/docs', {
      kind: 'out',
      outCategoryId: ids.outCategoryId,
      reason: '',
      lines: [{ materialId: first.materialId, qty: 1 }],
    }),
  )
  await page.callMethod('onSubmit')
  await waitData(page, 'realtime', copy.stock.stocktakeStale)
  await waitData(page, 'form.lines.0.bookQty', first.bookQty - 1)
  expect(await page.data('form.lines.0.actualText')).toBe(actual)
  expect(await page.data('form.reason')).toBe('花材数量复核')
  await snap(mini, 'stocktake-stale-draft')
  await page.callMethod('onSubmit')
  page = await waitPage(mini, 'packages/warehouse/pages/stocktake-detail/index')
  await waitData(page, 'loaded', true)
  expect(await stockQtyOf(server, first.materialId)).toBe(Number(actual))
})

test('D28/F04: manual inbound financial and supplier detail, payment locks and withdrawal refreshes actions', async () => {
  const { mini, server } = suite()
  const incoming = await whDocOf(server, 'in')
  await asMini(mini, server, 'u6')
  let page = await enter(mini, `/packages/finance/pages/supplier/index?id=${incoming.supplierId}`)
  await waitData(page, 'loaded', true)
  expect(await page.data('rows')).toContainEqual(
    expect.objectContaining({ id: `wh:${incoming.id}`, docType: 'wh' }),
  )
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: `wh:${incoming.id}` } } })
  page = await waitPage(mini, 'packages/finance/pages/payable/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('stockView.info.title')).toBe(incoming.no)
  expect(await page.data('view')).toBeFalsy()
  await snap(mini, 'finance-manual-payable')
  await mini.navigateTo(
    `/packages/finance/pages/receive/index?kind=payment&supplierId=${incoming.supplierId}`,
  )
  page = await waitPage(mini, 'packages/finance/pages/receive/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onDate', { detail: TODAY })
  await page.callMethod('onAmount', { detail: '20.00' })
  await page.callMethod('onMethod', { detail: '微信' })
  const allocs = (await page.data('form.allocs')) as {
    orderId: string
    docType: string
    docId: string
  }[]
  expect(allocs).toContainEqual(
    expect.objectContaining({ orderId: `wh:${incoming.id}`, docType: 'wh', docId: incoming.id }),
  )
  for (const [index, row] of allocs.entries())
    await page.callMethod('onAlloc', {
      currentTarget: { dataset: { index } },
      detail: row.orderId === `wh:${incoming.id}` ? '20.00' : '',
    })
  await page.callMethod('onSubmit')
  await waitPage(mini, 'packages/finance/pages/payable/index')
  const finance = await server.as('u6'),
    api = await asMini(mini, server, 'u5')
  page = await enter(mini, `${warehouse}/doc-detail/index?id=${incoming.id}`)
  await waitData(page, 'loaded', true)
  expect(
    ((await page.data('buttons')) as { disabled: boolean }[]).every((row) => row.disabled),
  ).toBe(true)
  const detail = dataOf<WhDocDetail>(await api.get(`/warehouse/docs/${incoming.id}`))
  dataOf(
    await finance.post(`/finance/payment-allocations/${detail.allocations[0]?.id}/revoke`, {
      reason: '重新核对',
    }),
  )
  await expect
    .poll(
      async () =>
        ((await page.data('buttons')) as { code: string; disabled: boolean }[]).find(
          (row) => row.code === 'reprice',
        )?.disabled,
    )
    .toBe(false)
  await asMini(mini, server, 'p1')
  page = await enter(mini, '/packages/supplier/pages/statement/index')
  await waitData(page, 'loaded', true)
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: `wh:${incoming.id}` } } })
  await waitData(page, 'sheet', true)
  await expect
    .poll(async () => page.data('stockView.info.title') as Promise<unknown>)
    .toBe(incoming.no)
  await waitData(page, 'stockView.heading', copy.stock.supplierStockIn)
  const sheet = (await page.$('#ap-document-sheet')) as CustomElement | null
  if (!sheet) throw new Error('no supplier document sheet')
  await expect
    .poll(async () => sheet.data('title') as Promise<unknown>)
    .toBe(copy.stock.supplierStockIn)
  await snap(mini, 'supplier-manual-inbound')
})

test('warehouse entries and stock moves: filter records and open the source document', async () => {
  const { mini, server } = suite()
  const incoming = await whDocOf(server, 'in')
  await asMini(mini, server, 'u5')
  let page = await enter(mini, `${warehouse}/home/index`)
  const entries = () =>
    mini.evaluate(
      'function () { var page = getCurrentPages().slice(-1)[0]; var home = page.selectComponent("#warehouse-home"); return home ? home.data.entries : [] }',
    ) as Promise<unknown>
  await expect
    .poll(entries)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'stock-in' }),
        expect.objectContaining({ key: 'stock-out' }),
        expect.objectContaining({ key: 'loss' }),
        expect.objectContaining({ key: 'stocktakes' }),
      ]),
    )
  page = await enter(mini, `${warehouse}/moves/index?materialId=${incoming.lines[0]?.materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onFilter', {
    detail: {
      ...emptyFilter,
      picks: { type: 'manual_in', material: incoming.lines[0]?.materialId },
    },
  })
  await expect.poll(async () => ((await page.data('rows')) as unknown[]).length).toBe(1)
  const rows = (await page.data('rows')) as { id: string; docId: string; total: string }[]
  expect(rows[0]?.docId).toBe(incoming.id)
  expect(rows[0]?.total).toBe('+10 枝')
  const card = (await page.$('components\\/hz-card\\/index')) as CustomElement | null
  if (!card) throw new Error('no movement card')
  expect(await card.data('headText')).toBe('手工入库')
  const total = await card.$('.hz-card__total--gain')
  expect(await total?.style('color')).toMatch(/^(?:rgb\(76,\s*106,\s*72\)|#4c6a48)$/i)
  await snap(mini, 'stock-moves')
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: rows[0]?.id } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.info.title')).toBe(incoming.no)
})
