// X2 销售订单（06 章 X2）：搜索（单号、客户、门店）+ 筛选状态、客户、下单日期；三行卡片；底栏「新建订单」（create）
import {
  contract,
  copy,
  redesignCopy,
  formatMoney,
  labels,
  type CustomerItem,
  type OrderCard,
  type OrderStatus,
  type StoreItem,
} from '@huazhong/shared'
import { hasAction, canDo } from '../../../../core/actions'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { loadCustomers } from '../../../../views/customers'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'
import { pullToRefresh } from '../../../../core/live'

const CUSTOMER = 'customer'
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
    rows: [] as ReturnType<typeof orderRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.orders,
    allLoaded: copy.state.allLoaded,
    canCreate: false,
    selected: [] as { id: string; version: number; no: string }[],
    batchSheet: false,
    batchOrders: [] as { id: string; version: number; no: string; title: string }[],
    inviteSheet: false,
    inviteCustomers: [] as CustomerItem[],
    batchOverdue: [] as string[],
    batchText: redesignCopy.confirmMany(0),
    texts: {
      allSelected: redesignCopy.allSelected,
      invite: copy.screen.action.inviteStore,
    },
    createText: copy.screen.action.createOrder,
  },
  cards: [] as OrderCard[],
  customers: [] as CustomerItem[],
  sharing: null as { path: string; title: string } | null,
  dimensionsReady: false,
  dimensionsBusy: false,
  list: null as PagedList<OrderCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    // 模块首页「查看全部」带状态进来
    this.setData({
      filter: {
        ...emptyFilter,
        status: query.status ?? '',
        picks: query.cancelRequested === 'true' ? { status: 'cancelRequested' } : {},
      },
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
    return {
      ...orderRowOf(order, false),
      selectable: order.status === 'pending_confirm',
      selectDisabled: !canDo(order.actions, 'confirm'),
      selected: this.data.selected.some((row) => row.id === order.id),
    }
  },
  renderSelection() {
    this.setData({
      rows: this.cards.map((order) => this.rowOf(order)),
      batchText: redesignCopy.confirmMany(this.data.selected.length),
    })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail, selected: [], batchText: redesignCopy.confirmMany(0) })
    void this.list?.refresh()
  },
  onToggle(event: KeyEvent) {
    const order = this.cards.find((row) => row.id === event.currentTarget.dataset.key)
    if (!order || !canDo(order.actions, 'confirm')) return
    const selected = this.data.selected.some((row) => row.id === order.id)
      ? this.data.selected.filter((row) => row.id !== order.id)
      : [...this.data.selected, { id: order.id, version: order.version, no: order.no }]
    this.setData({ selected })
    this.renderSelection()
  },
  onSelectAll() {
    const eligible = this.cards.filter((row) => canDo(row.actions, 'confirm'))
    const all = eligible.every((row) => this.data.selected.some((p) => p.id === row.id))
    this.setData({
      selected: all
        ? []
        : eligible.map((row) => ({ id: row.id, version: row.version, no: row.no })),
    })
    this.renderSelection()
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
    this.setData({ selected: [], batchSheet: false })
    await this.list?.refresh()
    void wx.showToast({ title: event.detail.message, icon: 'none' })
  },
  // 邀请订货：弹层（hz-store-invite）里选门店、必要时填登录手机号，生成邀请后点「发给门店」直接转发小程序卡片
  async onInvite(): Promise<void> {
    this.sharing = null
    // 绑定、手机号状态随时会变：每次打开重新取，取不到再用缓存
    const result = await loadCustomers()
    if (result.ok) this.customers = result.data
    this.setData({ inviteSheet: true, inviteCustomers: this.customers })
  },
  onCloseInvite() {
    this.setData({ inviteSheet: false })
  },
  onInvited(event: DetailEvent<{ path: string; title: string } | null>) {
    this.sharing = event.detail
  },
  // 弹层里补了登录手机号：同步页面缓存的门店，下次打开不用重新取
  onStoreUpdated(event: DetailEvent<StoreItem>) {
    const store = event.detail
    this.customers = this.customers.map((customer) => ({
      ...customer,
      stores: customer.stores.map((s) => (s.id === store.id ? store : s)),
    }))
  },
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const invited = this.sharing
    return invited
      ? { title: invited.title, path: invited.path, imageUrl: '/assets/backdrop.jpg' }
      : { title: copy.invite.storeTitle }
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${PAGES}/order-detail/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=create` })
  },
})
