// X2 销售订单（06 章 X2）：搜索（单号、客户、门店）+ 筛选状态、客户、下单日期；三行卡片；底栏「新建订单」（create）
import {
  contract,
  copy,
  redesignCopy,
  addDays,
  shanghaiDateOf,
  formatMoney,
  labels,
  type CustomerItem,
  type OrderCard,
  type OrderStatus,
} from '@huazhong/shared'
import { hasAction, canDo } from '../../../../core/actions'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { failureOf } from '../../../../core/session'
import { request } from '../../../../core/request'
import { loadCustomers } from '../../../../views/customers'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { orderRowOf } from '../../../../views/order'

const CUSTOMER = 'customer'
const PAGES = '/packages/sales/pages'

const BATCH_PREVIEW_COUNT = 3
Page({
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
    batchDate: '',
    batchError: '',
    batchBusy: false,
    batchNos: [] as string[],
    batchOverdue: [] as string[],
    batchText: redesignCopy.confirmMany(0),
    texts: {
      allSelected: redesignCopy.allSelected,
      confirmOrders: redesignCopy.confirmOrders,
      shipDate: redesignCopy.shipDate,
      invite: copy.screen.action.inviteStore,
    },
    createText: copy.screen.action.createOrder,
  },
  cards: [] as OrderCard[],
  customers: [] as CustomerItem[],
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
    void this.loadDimensions()
  },
  onShow() {
    showList(this, ['orders'])
  },
  async loadDimensions(): Promise<void> {
    const result = await loadCustomers()
    if (!result.ok) return
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
    this.setData({
      batchOverdue: this.customers
        .filter(
          (customer) =>
            customer.overdue &&
            this.cards.some(
              (order) =>
                order.customerId === customer.id &&
                this.data.selected.some((row) => row.id === order.id),
            ),
        )
        .map((customer) =>
          redesignCopy.overdueNotice(
            customer.name,
            formatMoney(customer.overdue?.amountCents ?? 0),
            customer.overdue?.days ?? 0,
          ),
        ),
      batchSheet: true,
      batchDate: addDays(shanghaiDateOf(Date.now()), 1),
      batchError: '',
      batchNos: [
        ...this.data.selected.slice(0, BATCH_PREVIEW_COUNT).map((row) => row.no),
        ...(this.data.selected.length > BATCH_PREVIEW_COUNT
          ? [redesignCopy.moreOrders(this.data.selected.length)]
          : []),
      ],
    })
  },
  onBatchDate(event: DetailEvent<string>) {
    this.setData({ batchDate: event.detail, batchError: '' })
  },
  onCloseBatch() {
    if (!this.data.batchBusy) this.setData({ batchSheet: false })
  },
  async onConfirmBatch() {
    if (this.data.batchBusy) return
    this.setData({ batchBusy: true, batchError: '' })
    const result = await request(contract.batchConfirmOrders, {
      body: {
        orders: this.data.selected.map(({ id, version }) => ({ id, version })),
        shipDate: this.data.batchDate,
      },
    })
    this.setData({ batchBusy: false })
    if (!result.ok) {
      this.setData({ batchError: failureOf(result.failure, 'submit')?.message ?? '' })
      return
    }
    const message = result.data.failed.length
      ? redesignCopy.confirmationResult(
          result.data.failed.length,
          result.data.failed.map((row) => `${row.no} ${row.reason}`).join(copy.separator),
        )
      : copy.order.confirmed
    this.setData({ selected: [], batchSheet: false })
    await this.list?.refresh()
    void wx.showToast({ title: message, icon: 'none' })
  },
  onInvite() {
    void wx.navigateTo({ url: `${PAGES}/customers/index?invite=true` })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({ url: `${PAGES}/order-detail/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=create` })
  },
})
