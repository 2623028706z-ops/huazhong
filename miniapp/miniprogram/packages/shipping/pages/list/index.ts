// H2 发货单（06 章 H2）：状态（待发货、已发货）+ 搜索（客户、门店）；待发货里也列出货日期以后的单。点开 → H3
import { contract, copy, type OrderCard } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'

type ShipStatus = 'to_ship' | 'shipped'
const statuses: ShipStatus[] = ['to_ship', 'shipped']

// 筛选栏「全部」= 不传状态，待发货和已发货都查
function statusOf(value: string): ShipStatus | undefined {
  return statuses.find((status) => status === value)
}

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.shipList,
    statusKind: 'orderStatus',
    statuses,
    counts: {},
    searchPlaceholder: copy.screen.label.searchShipments,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof orderRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.shipments,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<OrderCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ filter: { ...emptyFilter, status: statusOf(query.status ?? '') ?? '' } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { q } = listQueryOf(this.data.filter)
        const status = statusOf(this.data.filter.status)
        const result = await request(contract.listShippingOrders, { query: { status, q, cursor } })
        if (result.ok) this.setData({ counts: result.data.counts })
        return result
      },
      (order: OrderCard) => orderRowOf(order, false),
    )
  },
  onShow() {
    showList(this, ['orders'])
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/shipping/pages/ship/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
