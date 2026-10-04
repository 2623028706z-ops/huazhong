import { contract, copy, type OrderCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
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
    title: copy.screen.title.pickOrder,
    statusKind: 'orderStatus',
    filter: emptyFilter,
    rows: [] as ReturnType<typeof orderRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.afterable,
    allLoaded: copy.state.allLoaded,
    texts: { search: copy.screen.label.searchOrders },
  },
  cards: [] as OrderCard[],
  list: null as PagedList<OrderCard> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const { q } = listQueryOf(this.data.filter)
        const result = await request(contract.listOrders, {
          query: { afterable: 'true', cursor, q },
        })
        if (result.ok)
          this.cards = cursor ? [...this.cards, ...result.data.items] : result.data.items
        return result
      },
      (order) => orderRowOf(order, false),
    )
  },
  onShow() {
    showList(this, ['orders', 'afters'])
  },
  // 点一张订单直接进售后表单，不用再点「下一步」
  onOpen(event: KeyEvent) {
    const selected = event.currentTarget.dataset.key
    if (!this.cards.some((order) => order.id === selected && canDo(order.actions, 'createAfter')))
      return
    void wx.redirectTo({ url: `/packages/sales/pages/after-form/index?orderId=${selected}` })
  },
})
