// X2 销售订单（06 章 X2）：搜索（单号、客户、门店）+ 筛选状态、客户、下单日期；列表卡；底栏「新建订单」（create）。
// 批量确认按统一勾选写法（views/batch.ts）：「全部」「待确认」页签能勾，勾了底栏换「全选 / 批量确认（n）」
// 邀请订货在 X8 客户页底栏（2026-10-05 体验改版第 1 批）
import {
  contract,
  copy,
  redesignCopy,
  formatMoney,
  labels,
  type CustomerItem,
  type OrderCard,
  type OrderStatus,
} from '@huazhong/shared'
import { hasAction } from '../../../../core/actions'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { allToggled, checkOf, showsChecks, toggled, type Picked } from '../../../../views/batch'
import { loadCustomers } from '../../../../views/customers'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'
import { pullToRefresh } from '../../../../core/live'

const CUSTOMER = 'customer'
// 能批量确认的页签
const CONFIRMABLE = 'pending_confirm'
const PAGES = '/packages/sales/pages'

Page({
  ...pullToRefresh,
  ...listHandlers,
  data: {
    title: copy.screen.title.salesOrders,
    statusKind: 'orderStatus',
    statuses: ['pending_confirm', 'to_ship', 'shipped'],
    counts: {},
    searchPlaceholder: copy.screen.label.searchOrders,
    dateLabel: copy.screen.label.orderDate,
    dimensions: [] as FilterDimension[],
    filter: emptyFilter,
    rows: [] as (ReturnType<typeof orderRowOf> & ReturnType<typeof checkOf>)[],
    selection: false,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.orders,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    selected: [] as Picked[],
    batchSheet: false,
    batchOrders: [] as { id: string; version: number; no: string; title: string }[],
    batchOverdue: [] as string[],
    batchText: redesignCopy.confirmMany(0),
    texts: {
      allSelected: redesignCopy.allSelected,
    },
    createText: copy.screen.action.createOrder,
  },
  cards: [] as OrderCard[],
  customers: [] as CustomerItem[],
  dimensionsReady: false,
  dimensionsBusy: false,
  list: null as PagedList<OrderCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    // 模块首页「查看全部」带状态进来
    const status = query.status ?? ''
    this.setData({
      filter: {
        ...emptyFilter,
        status,
        picks: query.cancelRequested === 'true' ? { status: 'cancelRequested' } : {},
      },
      selection: showsChecks(status, CONFIRMABLE),
    })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, q, from, to, picks } = listQueryOf<OrderStatus>(this.data.filter)
        const customerId = picks[CUSTOMER]
        const pickedStatus = picks.status
        const queryStatus =
          pickedStatus === 'cancelled' || pickedStatus === 'voided' ? pickedStatus : status
        const input = {
          query: {
            status: queryStatus,
            q,
            from,
            to,
            customerId,
            cursor,
            cancelRequested: pickedStatus === 'cancelRequested' ? 'true' : undefined,
          },
        }
        const result = await request(contract.listOrders, input)
        if (result.ok) {
          this.cards = cursor ? [...this.cards, ...result.data.items] : result.data.items
          this.setData({
            counts: result.data.counts,
            canCreate: hasAction(result.data.actions, 'create'),
          })
        }
        return result
      },
      (order: OrderCard) => this.rowOf(order),
    )
  },
  onShow() {
    showList(this, ['orders'])
    // 客户选项失败后不重试会一直缺：回到页面时补拉一次
    void this.loadDimensions()
  },
  async loadDimensions(): Promise<void> {
    if (this.dimensionsReady || this.dimensionsBusy) return
    this.dimensionsBusy = true
    const result = await loadCustomers()
    this.dimensionsBusy = false
    if (!result.ok) return
    this.dimensionsReady = true
    this.customers = result.data
    const options = result.data.map(({ id, name }) => ({ id, name }))
    this.setData({
      dimensions: [
        { key: CUSTOMER, label: copy.screen.label.customer, options },
        {
          key: 'status',
          label: copy.field.status,
          options: [
            { id: 'cancelRequested', name: redesignCopy.cancelApplication },
            { id: 'cancelled', name: labels.orderStatus.cancelled },
            { id: 'voided', name: labels.orderStatus.voided },
          ],
        },
      ],
    })
  },
  rowOf(order: OrderCard) {
    return { ...orderRowOf(order, false), ...checkOf(order, 'confirm', this.data.selected) }
  },
  renderSelection(selected: Picked[]) {
    this.setData({ selected, batchText: redesignCopy.confirmMany(selected.length) })
    this.setData({ rows: this.cards.map((order) => this.rowOf(order)) })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({
      filter: event.detail,
      selection: showsChecks(event.detail.status, CONFIRMABLE),
      selected: [],
      batchText: redesignCopy.confirmMany(0),
    })
    void this.list?.refresh()
  },
  onToggle(event: KeyEvent) {
    const order = this.cards.find((row) => row.id === event.currentTarget.dataset.key)
    if (order) this.renderSelection(toggled(this.data.selected, order, 'confirm'))
  },
  onSelectAll() {
    this.renderSelection(allToggled(this.data.selected, this.cards, 'confirm'))
  },
  onOpenBatch() {
    if (!this.data.selected.length) return
    const picked = this.data.selected
    this.setData({
      batchOverdue: this.customers
        .filter(
          (customer) =>
            customer.overdue &&
            this.cards.some(
              (order) =>
                order.customerId === customer.id && picked.some((row) => row.id === order.id),
            ),
        )
        .map((customer) =>
          redesignCopy.overdueNotice(
            customer.name,
            formatMoney(customer.overdue?.amountCents ?? 0),
            customer.overdue?.days ?? 0,
          ),
        ),
      batchOrders: picked.map((row) => {
        const order = this.cards.find((card) => card.id === row.id)
        return {
          ...row,
          title: order ? copy.org.store(order.customerName, order.storeName) : '',
        }
      }),
      batchSheet: true,
    })
  },
  onCloseBatch() {
    this.setData({ batchSheet: false })
  },
  // 弹层里确认完：清掉勾选、刷新列表，提示成功几单、失败几单
  async onBatchDone(event: DetailEvent<{ message: string }>) {
    this.setData({ selected: [], batchSheet: false, batchText: redesignCopy.confirmMany(0) })
    await this.list?.refresh()
    void wx.showToast({ title: event.detail.message, icon: 'none' })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${PAGES}/order-detail/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=create` })
  },
})
