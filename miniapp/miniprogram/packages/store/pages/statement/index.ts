// S9 对账（06 章 S9）：筛选出货日期（默认全部）；对账格按区间算（发货金额、售后、已付、待付）；
// 本店发货单三行卡片（未付 / 部分付 / 已付），点开 → S6
import { contract, copy, type ArCard } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { arRowOf } from '../../../../views/ar'
import { listHandlers, listOf, listQueryOf } from '../../../../views/list'

interface Summary {
  shippedCents: number
  afterCents: number
  paidCents: number
  unpaidCents: number
}

function cellsOf(summary: Summary) {
  return [
    { label: copy.screen.label.shipAmount, amountCents: summary.shippedCents, due: false },
    { label: copy.screen.label.after, amountCents: summary.afterCents, due: false },
    { label: copy.screen.label.paid, amountCents: summary.paidCents, due: false },
    { label: copy.screen.label.due, amountCents: summary.unpaidCents, due: true },
  ]
}

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.statement,
    statusKind: 'storePayStatus',
    dateLabel: copy.field.shipDate,
    filter: emptyFilter,
    cells: [] as ReturnType<typeof cellsOf>,
    rows: [] as ReturnType<typeof arRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.statement,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<ArCard> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const { from, to } = listQueryOf(this.data.filter)
        const result = await request(contract.storeStatement, { query: { from, to, cursor } })
        if (result.ok && cursor === undefined) this.setData({ cells: cellsOf(result.data) })
        return result
      },
      (card: ArCard) => arRowOf(card, true),
    )
  },
  onShow() {
    void this.list?.refresh()
    void this.watchAr()
  },
  // ar 主题要客户 id：从门店首页取
  async watchAr(): Promise<void> {
    const home = await request(contract.storeHome)
    if (!home.ok) {
      this.setData({ failure: failureOf(home.failure, 'refresh') })
      return
    }
    watch(this, [`ar:${home.data.customerId}`], () => void this.list?.refresh())
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/store/pages/order-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
