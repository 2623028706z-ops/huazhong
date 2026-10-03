import { contract, copy, type StocktakeCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { listHandlers, listOf, showList } from '../../../../views/list'

function rowOf(doc: StocktakeCard) {
  return {
    id: doc.id,
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
Page({
  ...listHandlers,
  data: {
    title: copy.stock.screen.titles.stocktakes,
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
      create: copy.stock.screen.create.stocktake,
      select: copy.stock.screen.selectCategories,
      start: copy.stock.screen.startStocktake,
    },
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
    if (result.ok)
      this.setData({
        sheet: true,
        categoryError: '',
        categories: result.data.items.map((row) => ({
          id: row.id,
          name: row.name,
          selected: false,
        })),
      })
    else this.setData({ failure: failureOf(result.failure, 'refresh') })
  },
  onCategory(event: DetailEvent<boolean, { key: string }>) {
    this.setData({
      categoryError: '',
      categories: this.data.categories.map((row) =>
        row.id === event.currentTarget.dataset.key ? { ...row, selected: event.detail } : row,
      ),
    })
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
