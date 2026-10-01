// S3 订单（06 章 S3）：筛选状态、下单日期；三行卡片，点开 → S6
import { contract, copy, orderStatuses, type OrderCard, type OrderStatus } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.storeOrders,
    statusKind: 'orderStatus',
    statuses: [...orderStatuses],
    counts: {},
    dateLabel: copy.screen.label.orderDate,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof orderRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.orders,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<OrderCard> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<OrderStatus>(this.data.filter)
        const result = await request(contract.listOrders, { query: { status, from, to, cursor } })
        if (result.ok) this.setData({ counts: result.data.counts })
        return result
      },
      (order: OrderCard) => orderRowOf(order, true),
    )
  },
  onShow() {
    showList(this, ['orders'])
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/store/pages/order-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
