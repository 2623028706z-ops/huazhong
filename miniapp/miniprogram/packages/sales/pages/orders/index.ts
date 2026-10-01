// X2 销售订单（06 章 X2）：搜索（单号、客户、门店）+ 筛选状态、客户、下单日期；三行卡片；底栏「新建订单」（create）
import { contract, copy, orderStatuses, type OrderCard, type OrderStatus } from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { loadCustomers } from '../../../../views/customers'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'

const CUSTOMER = 'customer'
const PAGES = '/packages/sales/pages'

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.salesOrders,
    statusKind: 'orderStatus',
    statuses: [...orderStatuses],
    counts: {},
    searchPlaceholder: copy.screen.label.searchOrders,
    dateLabel: copy.screen.label.orderDate,
    dimensions: [] as FilterDimension[],
    filter: emptyFilter,
    rows: [] as ReturnType<typeof orderRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.orders,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    createText: copy.screen.action.createOrder,
  },
  list: null as PagedList<OrderCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    // 模块首页「查看全部」带状态进来
    if (query.status) this.setData({ filter: { ...emptyFilter, status: query.status } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, q, from, to, picks } = listQueryOf<OrderStatus>(this.data.filter)
        const customerId = picks[CUSTOMER]
        const input = { query: { status, q, from, to, customerId, cursor } }
        const result = await request(contract.listOrders, input)
        if (result.ok) {
          this.setData({
            counts: result.data.counts,
            canCreate: hasAction(result.data.actions, 'create'),
          })
        }
        return result
      },
      (order: OrderCard) => orderRowOf(order, false),
    )
    void this.loadDimensions()
  },
  onShow() {
    showList(this, ['orders'])
  },
  async loadDimensions(): Promise<void> {
    const result = await loadCustomers()
    if (!result.ok) return
    const options = result.data.map(({ id, name }) => ({ id, name }))
    this.setData({ dimensions: [{ key: CUSTOMER, label: copy.screen.label.customer, options }] })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${PAGES}/order-detail/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=create` })
  },
})
