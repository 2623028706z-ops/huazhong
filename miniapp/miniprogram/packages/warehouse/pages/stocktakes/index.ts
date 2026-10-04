import { contract, copy, redesignCopy, type StocktakeCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { listHandlers, listOf, showList } from '../../../../views/list'
import { pullToRefresh } from '../../../../core/live'

function rowOf(doc: StocktakeCard) {
  return {
    id: doc.id,
    fields: [
      { label: redesignCopy.no, value: doc.no },
      { label: copy.stock.screen.actor, value: doc.actorName },
      { label: copy.stock.screen.checkDate, value: doc.checkDate },
      { label: copy.stock.screen.lineCountLabel, value: copy.stock.lineCount(doc.lineCount) },
      {
        label: copy.stock.screen.difference,
        value: doc.diffCount ? copy.stock.diffCount(doc.diffCount) : copy.stock.screen.noDifference,
      },
    ],
    date: doc.checkDate,
    status: doc.status,
    title: doc.categories.join(copy.separator),
    total: copy.stock.lineCount(doc.lineCount),
    meta: [
      doc.no,
      doc.diffCount ? copy.stock.diffCount(doc.diffCount) : copy.stock.screen.noDifference,
    ].join(copy.separator),
    amount: null,
    tags: [],
  }
}
function pickedOf(categories: { selected: boolean }[]) {
  const count = categories.filter((row) => row.selected).length
  return {
    allSelected: categories.length > 0 && count === categories.length,
    startText: count ? copy.stock.startCount(count) : copy.stock.screen.startStocktake,
  }
}
Page({
  ...pullToRefresh,
  ...listHandlers,
  data: {
    title: redesignCopy.stocktakeRecords,
    statusKind: 'stocktakeStatus',
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    rows: [] as ReturnType<typeof rowOf>[],
    emptyObject: copy.stock.screen.empty.stocktake,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    sheet: false,
    categories: [] as { id: string; name: string; selected: boolean }[],
    categoryError: '',
    texts: {
      selectAll: copy.stock.screen.selectAll,
      create: copy.stock.screen.create.stocktake,
      select: copy.stock.screen.selectCategories,
      start: copy.stock.screen.startStocktake,
    },
    startText: '',
    allSelected: false,
  },
  list: null as PagedList<StocktakeCard> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const result = await request(contract.listStocktakes, { query: { cursor } })
        if (result.ok) this.setData({ canCreate: canDo(result.data.actions, 'create') })
        return result
      },
      rowOf,
    )
  },
  onShow() {
    showList(this, ['stock'])
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/warehouse/pages/stocktake-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
  async onCreate() {
    if (!this.data.canCreate) return
    const result = await request(contract.listMaterialCategories)
    const pickedCategories = result.ok
      ? result.data.items.map((row) => ({ id: row.id, name: row.name, selected: true }))
      : []
    if (result.ok)
      this.setData({
        sheet: true,
        categoryError: '',
        // 默认全选，一键开始
        categories: pickedCategories,
        ...pickedOf(pickedCategories),
      })
    else this.setData({ failure: failureOf(result.failure, 'refresh') })
  },
  onCategory(event: DetailEvent<boolean, { key: string }>) {
    const categories = this.data.categories.map((row) =>
      row.id === event.currentTarget.dataset.key ? { ...row, selected: event.detail } : row,
    )
    this.setData({ categoryError: '', categories, ...pickedOf(categories) })
  },
  onAll(event: DetailEvent<boolean>) {
    const categories = this.data.categories.map((row) => ({ ...row, selected: event.detail }))
    this.setData({ categoryError: '', categories, ...pickedOf(categories) })
  },
  onClose() {
    this.setData({ sheet: false })
  },
  onStart() {
    const ids = this.data.categories.filter((row) => row.selected).map((row) => row.id)
    if (!ids.length) {
      this.setData({ categoryError: copy.stock.categoriesRequired })
      return
    }
    this.setData({ sheet: false })
    void wx.navigateTo({
      url: `/packages/warehouse/pages/stocktake-form/index?categoryIds=${ids.join(',')}`,
    })
  },
})
