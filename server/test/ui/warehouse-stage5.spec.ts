import { copy, type StatementDetail, type PaymentDetail, type WhDocDetail } from '@huazhong/shared'
import { expect, test } from 'vitest'
import type { CustomElement } from 'miniprogram-automator/out/Element.js'
import { dataOf, idBy, TODAY } from '../support/sales.ts'
import { stockQtyOf, whDocOf, whIds } from '../support/warehouse.ts'
import { openStatement } from '../support/statements.ts'
import { editWarehouseLine } from './warehouse-lines.ts'
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

test('C11: 花材详情新建手工入库后进入本张详情，改价和作废留页', async () => {
  const { mini, server } = suite()
  await asMini(mini, server, 'u5')
  const ids = await whIds(server)
  let page = await enter(mini, `${warehouse}/material/index?id=${ids.materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onStockIn')
  page = await waitPage(mini, 'packages/warehouse/pages/doc-form/index')
  await waitData(page, 'loaded', true)
  await waitData(page, 'form.lines.0.materialId', ids.materialId)
  await pickOption(page, '#doc-supplier', ids.supplierId)
  await editWarehouseLine(page, 0, { qty: 5, price: '2.00' })
  await inputField(page, '#doc-reason', '临时采购')
  await snap(mini, 'stock-in-form')
  await tapText(page, copy.stock.screen.submit.in)
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.lines.0.amountCents')).toBe(1000)
  expect(await page.data('view.notice')).toBe('')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'reprice' } } })
  await editWarehouseLine(page, 0, { price: '3.00' })
  await page.callMethod('onSave')
  await waitData(page, 'fields.reason', copy.finance.repriceReason)
  await page.callMethod('onReason', { detail: '供应商调整报价' })
  await page.callMethod('onSave')
  await waitData(page, 'sheet', '')
  await waitData(page, 'view.lines.0.amountCents', 1500)
  await snap(mini, 'stock-in-repriced')
  await page.callMethod('onAction', { currentTarget: { dataset: { code: 'void' } } })
  await page.callMethod('onReason', { detail: '重复录入' })
  await page.callMethod('onSave')
  await waitData(page, 'view.info.status', 'voided')
  expect(await page.data('buttons')).toEqual([])
})

test('C12-F/C20-F/C21: 花材出库入口与分类管理保留草稿，保存进入本张详情', async () => {
  const { mini, server } = suite()
  await asMini(mini, server, 'u5')
  const materialId = await idBy(server.t, 'materials.name', '尤加利'),
    ids = await whIds(server)
  const before = await stockQtyOf(server, materialId)
  let page = await enter(mini, `${warehouse}/material/index?id=${materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onStockOut')
  page = await waitPage(mini, 'packages/warehouse/pages/doc-form/index')
  await waitData(page, 'loaded', true)
  await waitData(page, 'form.lines.0.materialId', materialId)
  await editWarehouseLine(page, 0, { qty: 2 })
  await page.callMethod('onSubmit')
  await waitData(page, 'fields.outCategoryId', copy.stock.outCategoryRequired)
  await tapText(page, copy.screen.action.manageCategories)
  // 管理分类是表单上的弹层（W5），不离开表单
  await waitData(page, 'categorySheet', true)
  await page.callMethod('onSaveCategory', { detail: { id: '', name: '活动布置', enabled: true } })
  await expect
    .poll(async () =>
      ((await page.data('categoryOptions')) as { name: string }[]).some(
        (row) => row.name === '活动布置',
      ),
    )
    .toBe(true)
  const sampleId = await idBy(server.t, 'out_categories.name', '样品')
  await page.callMethod('onSaveCategory', {
    detail: { id: sampleId, name: '样品', enabled: false },
  })
  await expect
    .poll(async () =>
      ((await page.data('categoryOptions')) as { id: string }[]).some((row) => row.id === sampleId),
    )
    .toBe(false)
  await snap(mini, 'stock-out-categories')
  await page.callMethod('onCloseCategories')
  await waitData(page, 'categorySheet', false)
  expect(await page.data('form.lines.0.qty')).toBe(2)
  await pickOption(page, '#doc-category', ids.outCategoryId)
  await snap(mini, 'stock-out-form')
  await tapText(page, copy.stock.screen.submit.out)
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
  await asMini(mini, server, 'u5')
  const ids = await whIds(server)
  const before = await stockQtyOf(server, ids.materialId)
  let page = await enter(mini, `${warehouse}/doc-form/index?kind=loss&materialId=${ids.materialId}`)
  await waitData(page, 'loaded', true)
  await editWarehouseLine(page, 0, { qty: 5 })
  await tapText(page, copy.stock.screen.submit.loss)
  await waitData(page, 'fields.reason', copy.stock.lossReasonRequired)
  await inputField(page, '#doc-reason', '花头发黑')
  await snap(mini, 'stock-loss-form')
  await tapText(page, copy.stock.screen.submit.loss)
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await stockQtyOf(server, ids.materialId)).toBe(before - 5)
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
  const book = (await page.data('form.lines.0.bookQty')) as number
  await page.callMethod('onEdit', { currentTarget: { dataset: { index: 0 } } })
  await page.callMethod('onDraftActual', { detail: '' })
  await page.callMethod('onConfirmEditor')
  await page.callMethod('onSubmit')
  const invalid = (await page.data('fields')) as Record<string, string>
  expect(invalid['lines.0.actualQty']).toMatch(/\S+/)
  await page.callMethod('onEdit', { currentTarget: { dataset: { index: 0 } } })
  await page.callMethod('onDraftActual', { detail: '0' })
  await page.callMethod('onConfirmEditor')
  expect(await page.data('rows.0.actualText')).toBe('0')
  expect(await page.data('rows.0.diffQty')).toBe(String(-book))
  await snap(mini, 'redesign-stocktake-table')
  await page.callMethod('onEdit', { currentTarget: { dataset: { index: 0 } } })
  await page.callMethod('onDraftActual', { detail: String(book) })
  await page.callMethod('onConfirmEditor')
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

test('D28/F04: 手工入库经DZ付款，作废资金仍锁定、作废DZ后解锁，供应商只读', async () => {
  const { mini, server } = suite()
  const incoming = await whDocOf(server, 'in')
  if (!incoming.supplierId) throw new Error('expected supplier')
  const statement = await openStatement(server, 'supplier', incoming.supplierId, [
    { type: 'wh', id: incoming.id },
  ])
  const finance = await asMini(mini, server, 'u6')
  let page = await enter(mini, `/packages/finance/pages/statement-detail/index?id=${statement.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onSource', { currentTarget: { dataset: { key: `wh:${incoming.id}` } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('buttons')).toEqual([])
  await snap(mini, 'finance-manual-inbound-readonly')
  await mini.navigateTo(
    `/packages/finance/pages/receive/index?kind=payment&supplierId=${incoming.supplierId}&statementId=${statement.id}`,
  )
  page = await waitPage(mini, 'packages/finance/pages/receive/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('form.statements')).toContainEqual(
    expect.objectContaining({ id: statement.id }),
  )
  await page.callMethod('onField', {
    currentTarget: { dataset: { key: 'receiptDate' } },
    detail: TODAY,
  })
  await page.callMethod('onField', {
    currentTarget: { dataset: { key: 'methodName' } },
    detail: '微信',
  })
  await page.callMethod('onSubmit')
  await waitPage(mini, 'packages/finance/pages/supplier/index')
  const settled = dataOf<StatementDetail>(await finance.get(`/finance/statements/${statement.id}`))
  expect(settled.status).toBe('settled')
  await asMini(mini, server, 'p1')
  page = await enter(mini, `/packages/supplier/pages/statement-detail/index?id=${statement.id}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onSource', { currentTarget: { dataset: { key: `wh:${incoming.id}` } } })
  await waitData(page, 'sourceSheet', true)
  await expect
    .poll(async () => page.data('stockView.info.rows') as Promise<unknown>)
    .toContainEqual(expect.objectContaining({ value: incoming.no }))
  await snap(mini, 'supplier-manual-inbound')
  const api = await asMini(mini, server, 'u5')
  page = await enter(mini, `${warehouse}/doc-detail/index?id=${incoming.id}`)
  await waitData(page, 'loaded', true)
  expect(
    ((await page.data('buttons')) as { disabled: boolean }[]).every((row) => row.disabled),
  ).toBe(true)
  const settlement = settled.settlements.find((row) => row.kind === 'payment')
  if (!settlement) throw new Error('expected payment')
  const payment = dataOf<PaymentDetail>(await finance.get(`/finance/payments/${settlement.id}`))
  dataOf(
    await finance.post(`/finance/payments/${payment.id}/void`, {
      version: payment.version,
      reason: '重新核对',
    }),
  )
  const locked = dataOf<WhDocDetail>(await api.get(`/warehouse/docs/${incoming.id}`))
  expect(locked.actions.find((row) => row.code === 'reprice')?.enabled).toBe(false)
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
    .poll(
      async () =>
        ((await page.data('buttons')) as { code: string; disabled: boolean }[]).find(
          (row) => row.code === 'reprice',
        )?.disabled,
    )
    .toBe(false)
})

test('warehouse entries and stock moves: filter records and open the source document', async () => {
  const { mini, server } = suite()
  const incoming = await whDocOf(server, 'in')
  await asMini(mini, server, 'u5')
  let page = await enter(mini, `${warehouse}/home/index`)
  const entries = () =>
    mini.evaluate(
      'function () { var page = getCurrentPages().slice(-1)[0]; var home = page.selectComponent("#warehouse-home"); return home ? home.data.common : [] }',
    ) as Promise<unknown>
  await expect
    .poll(entries)
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'in' }),
        expect.objectContaining({ key: 'receive' }),
        expect.objectContaining({ key: 'out' }),
        expect.objectContaining({ key: 'loss' }),
        expect.objectContaining({ key: 'stocktake' }),
      ]),
    )
  page = await enter(mini, `${warehouse}/moves/index?materialId=${incoming.lines[0]?.materialId}`)
  await waitData(page, 'loaded', true)
  await page.callMethod('onDirection', { currentTarget: { dataset: { key: 'in' } } })
  await expect.poll(async () => ((await page.data('rows')) as unknown[]).length).toBe(1)
  const rows = (await page.data('rows')) as {
    id: string
    docId: string
    fields: { label: string; value: string }[]
  }[]
  expect(rows[0]?.docId).toBe(incoming.id)
  expect(rows[0]?.fields).toContainEqual({ label: '数量', value: '+10 枝' })
  const card = (await page.$('components\\/hz-card\\/index')) as CustomElement | null
  if (!card) throw new Error('no movement card')
  expect(await card.data('row.headText')).toBe('手工入库')
  await snap(mini, 'stock-moves')
  await page.callMethod('onOpen', { currentTarget: { dataset: { key: rows[0]?.id } } })
  page = await waitPage(mini, 'packages/warehouse/pages/doc-detail/index')
  await waitData(page, 'loaded', true)
  expect(await page.data('view.info.rows')).toContainEqual(
    expect.objectContaining({ value: incoming.no }),
  )
})
