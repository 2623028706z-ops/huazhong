import { contract, copy, redesignCopy, type StocktakeCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { CARD_SEPARATOR, cardDateOf, subOf, type CardRow } from '../../../../views/card'
import { listHandlers, listOf, showList } from '../../../../views/list'
import { stocktakePickData, stocktakePickHandlers } from '../../../../views/stocktake-pick'
import { pullToRefresh } from '../../../../core/live'

// 盘点卡（06 章 W8，2026-10-06 第 4 批）：大字分类，小字盘点日期 · 差异 n 种，右状态
function rowOf(doc: StocktakeCard): CardRow {
  return {
    id: doc.id,
    main: doc.categories.join(CARD_SEPARATOR),
    sub: subOf([
      cardDateOf(doc.checkDate),
      doc.diffCount ? copy.stock.diffCount(doc.diffCount) : '',
    ]),
    status: doc.status,
  }
}
Page({
  ...pullToRefresh,
  ...listHandlers,
  ...stocktakePickHandlers,
  data: {
    ...stocktakePickData,
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
    texts: {
      create: copy.stock.screen.create.stocktake,
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
    const failure = await this.openStocktake()
    if (failure) this.setData({ failure })
  },
})
