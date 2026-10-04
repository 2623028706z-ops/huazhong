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
    selected: '',
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.afterable,
    allLoaded: copy.state.allLoaded,
    texts: { search: copy.screen.label.searchOrders, next: copy.screen.action.next },
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
      (order) => ({
        ...orderRowOf(order, false),
        selectable: true,
        selectDisabled: !canDo(order.actions, 'createAfter'),
        selected: order.id === this.data.selected,
      }),
    )
  },
  onShow() {
    showList(this, ['orders', 'afters'])
  },
  onToggle(event: KeyEvent) {
    const selected = event.currentTarget.dataset.key
    if (!this.cards.some((order) => order.id === selected && canDo(order.actions, 'createAfter')))
      return
    this.setData({
      selected,
      rows: this.cards.map((order) => ({
        ...orderRowOf(order, false),
        selectable: true,
        selectDisabled: !canDo(order.actions, 'createAfter'),
        selected: order.id === selected,
      })),
    })
  },
  onOpen(event: KeyEvent) {
    this.onToggle(event)
  },
  onNext() {
    if (this.data.selected)
      void wx.redirectTo({
        url: `/packages/sales/pages/after-form/index?orderId=${this.data.selected}`,
      })
  },
})
