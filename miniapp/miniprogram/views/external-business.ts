import {
  contract,
  copy,
  financeCopy as f,
  type Topic,
  type OrderStatus,
  type AfterStatus,
  type Action,
  type Me,
} from '@huazhong/shared'
import { findAction } from '../core/actions'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterValue } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch, unwatchOnLeave, pullToRefresh } from '../core/live'
import { request } from '../core/request'
import { loadMe, storeUnseenOf, tabBadgeOf, tabsOf } from '../core/session'
import { listOf, listQueryOf } from './list'
import { orderRowOf } from './order'
import { afterRowOf } from './after'
import { poRowOf } from './purchase'
import { statementRowOf, type FinanceRow } from './statement'
type Segment = 'orders' | 'afters' | 'statements'
interface SegmentState {
  filter: FilterValue
  rows: FinanceRow[]
  loaded: boolean
  skeleton: boolean
  done: boolean
  failure: FailureView | null
  scrollTop: number
  cells: { label: string; amountCents: number; due: boolean }[]
  // 门店售后段底栏「申请售后」（列表级动作 applyAfter）；没有这个动作为 null
  apply: { text: string; disabled: boolean; reason: string } | null
}
function blank(): SegmentState {
  return {
    filter: { ...emptyFilter },
    rows: [],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null,
    scrollTop: 0,
    cells: [],
    apply: null,
  }
}
const data = {
  ...blank(),
  title: copy.screen.title.storeOrders as string,
  supplier: false,
  segment: 'orders' as Segment,
  segmentTabs: [] as { key: string; text: string }[],
  // 门店「订单」「售后」段名后的没看过数（GET /store/unseen）
  segmentCounts: {} as Record<string, number>,
  statusKind: '',
  statuses: [] as string[],
  dateLabel: '',
  searchPlaceholder: '',
  emptyObject: '',
  tabs: [] as ReturnType<typeof tabsOf>,
  allLoaded: copy.state.allLoaded,
}
interface Host {
  data: typeof data
  states: Partial<Record<Segment, SegmentState>>
  lists: Partial<Record<Segment, PagedList<FinanceRow>>>
  list: PagedList<FinanceRow> | null
  setData(patch: Record<string, unknown>): void
  activate(segment: Segment): void
}
function metaOf(segment: Segment, supplier: boolean) {
  if (segment === 'statements')
    return {
      statusKind: 'statementStatus',
      statuses: ['unsettled', 'settled'],
      dateLabel: f.statementDate,
      searchPlaceholder: '',
      emptyObject: f.statements,
    }
  if (segment === 'afters')
    return {
      statusKind: 'afterStatus',
      statuses: ['pending', 'processed', 'closed', 'voided'],
      dateLabel: copy.screen.label.afterDate,
      searchPlaceholder: '',
      emptyObject: copy.screen.empty.afters,
    }
  return supplier
    ? {
        statusKind: 'poStatus',
        statuses: ['to_receive', 'received', 'rejected', 'cancelled'],
        dateLabel: copy.screen.label.orderDate,
        searchPlaceholder: copy.screen.supplierPoSearch,
        emptyObject: copy.screen.empty.purchaseOrders,
      }
    : {
        statusKind: 'orderStatus',
        statuses: ['pending_confirm', 'to_ship', 'shipped', 'cancelled'],
        dateLabel: copy.screen.label.orderDate,
        searchPlaceholder: copy.flow.store.orderSearch,
        emptyObject: copy.screen.empty.orders,
      }
}
async function statementsOf(supplier: boolean, filter: FilterValue, cursor: string | undefined) {
  const { status, from, to } = listQueryOf<'unsettled' | 'settled' | 'voided'>(filter)
  const result = await request(supplier ? contract.supplierStatements : contract.storeStatements, {
    query: { status, from, to, cursor },
  })
  if (!result.ok) return result
  return {
    ...result,
    data: {
      ...result.data,
      items: result.data.items.map((item) => statementRowOf(item, supplier ? 'supplier' : 'store')),
      cells: [
        { label: f.unsettled, amountCents: result.data.unsettledCents, due: true },
        { label: f.unstatemented, amountCents: result.data.unstatementedCents, due: false },
      ],
    },
  }
}
async function aftersOf(filter: FilterValue, cursor: string | undefined) {
  const { status, from, to, q } = listQueryOf<AfterStatus>(filter),
    result = await request(contract.listAfters, { query: { status, from, to, q, cursor } })
  if (!result.ok) return result
  return {
    ...result,
    data: {
      ...result.data,
      items: result.data.items.map((item) => ({ ...afterRowOf(item, true), tags: [] })),
    },
  }
}
async function ordersOf(filter: FilterValue, cursor: string | undefined) {
  const { status, from, to, q } = listQueryOf<OrderStatus>(filter),
    result = await request(contract.listOrders, { query: { status, from, to, q, cursor } })
  if (!result.ok) return result
  return {
    ...result,
    data: { ...result.data, items: result.data.items.map((item) => orderRowOf(item, true)) },
  }
}
async function purchaseOrdersOf(filter: FilterValue, cursor: string | undefined) {
  const { status, from, to, q } = listQueryOf<
      'to_receive' | 'received' | 'rejected' | 'cancelled' | 'voided'
    >(filter),
    result = await request(contract.supplierPurchaseOrders, {
      query: { status, from, to, q, cursor },
    })
  if (!result.ok) return result
  return {
    ...result,
    data: {
      ...result.data,
      items: result.data.items.map((item) => ({
        ...poRowOf(item, true),
        status: item.status === 'voided' ? 'cancelled' : item.status,
      })),
    },
  }
}
async function fetchSegment(
  segment: Segment,
  supplier: boolean,
  filter: FilterValue,
  cursor: string | undefined,
) {
  if (segment === 'statements') return statementsOf(supplier, filter, cursor)
  if (segment === 'afters') return aftersOf(filter, cursor)
  return supplier ? purchaseOrdersOf(filter, cursor) : ordersOf(filter, cursor)
}
function listFor(host: Host, segment: Segment, state: SegmentState) {
  const viewHost = {
    setData: (patch: Record<string, unknown>) => {
      Object.assign(state, patch)
      if (host.data.segment === segment) host.setData(patch)
    },
  }
  return listOf<FinanceRow>(
    viewHost,
    async (cursor) => {
      const result = await fetchSegment(segment, host.data.supplier, state.filter, cursor)
      // 门店、供应商端的状态标签不带数：待确认、待发货、待处理、待收货都在等花众（03 章第 8.5 节）
      if (result.ok && 'cells' in result.data) viewHost.setData({ cells: result.data.cells })
      if (result.ok && segment === 'afters' && !cursor)
        viewHost.setData({ apply: applyOf(result.data.actions) })
      return result
    },
    (row) => row,
  )
}
// 售后段底栏「申请售后」→ S12 选订单（06 章 S7，2026-10-06 第 3 批）
function applyOf(actions: readonly Action[]): SegmentState['apply'] {
  const action = findAction(actions, 'applyAfter')
  if (!action) return null
  return {
    text: copy.screen.action.applyAfter,
    disabled: !action.enabled,
    reason: action.disabledReason ?? '',
  }
}
// 门店：底栏「订单」角标和「订单」「售后」段名数字（没看过的结果）
async function showUnseen(host: Host, me: Me) {
  const unseen = await storeUnseenOf()
  if (!unseen) return
  host.setData({
    tabs: tabsOf(me, unseen.total),
    segmentCounts: { orders: unseen.orders, afters: unseen.afters },
  })
}
async function topicsOf(host: Host) {
  const me = await loadMe()
  if (!me.ok) return
  const supplierId = me.data.supplierId ?? ''
  if (host.data.supplier) {
    host.setData({ tabs: tabsOf(me.data, await tabBadgeOf(me.data)) })
    subscribeLists(host, [`supplier:${supplierId}`, 'pos', `ap:${supplierId}`])
    return
  }
  const [catalog] = await Promise.all([request(contract.storeCatalog), showUnseen(host, me.data)])
  subscribeLists(
    host,
    ['orders', 'afters', ...(catalog.ok ? [`ar:${catalog.data.customerId}` as const] : [])],
    () => void showUnseen(host, me.data),
  )
}
// 推送来了：各段列表静默刷新；门店顺带刷新没看过的数
function subscribeLists(host: Host, topics: Topic[], also?: () => void) {
  watch(host, topics, () => {
    for (const list of Object.values(host.lists)) void list.refresh()
    also?.()
  })
}
const methods = {
  ...unwatchOnLeave,
  ...pullToRefresh,
  lists: {} as Host['lists'],
  states: {} as Host['states'],
  list: null as Host['list'],
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.lists = {}
    this.states = {}
    const tab = query.tab
    this.activate(tab === 'afters' || tab === 'statements' ? tab : this.data.segment)
  },
  activate(this: Host, segment: Segment) {
    const state = this.states[segment] ?? blank()
    this.states[segment] = state
    this.setData({ ...state, ...metaOf(segment, this.data.supplier), segment })
    this.lists[segment] ??= listFor(this, segment, state)
    this.list = this.lists[segment]
    if (!state.loaded) void this.list.refresh()
    void wx.pageScrollTo({ scrollTop: state.scrollTop, duration: 0 })
  },
  async onShow(this: Host) {
    await topicsOf(this)
    void this.list?.refresh()
  },
  onSegment(this: Host, event: DetailEvent<Segment>) {
    if (event.detail !== this.data.segment) this.activate(event.detail)
  },
  onFilter(this: Host, event: DetailEvent<FilterValue>) {
    const state = this.states[this.data.segment]
    if (state) state.filter = event.detail
    this.setData({ filter: event.detail })
    void this.list?.refresh()
  },
  onPageScroll(this: Host, event: { scrollTop: number }) {
    const state = this.states[this.data.segment]
    if (state) state.scrollTop = event.scrollTop
  },
  onReachBottom(this: Host) {
    void this.list?.more()
  },
  onFailureAction(this: Host) {
    void this.list?.refresh()
  },
  onApplyAfter() {
    void wx.navigateTo({ url: '/packages/store/pages/order-pick/index' })
  },
  onOpen(this: Host, event: KeyEvent) {
    const segment = this.data.segment,
      path = this.data.supplier
        ? segment === 'statements'
          ? 'statement-detail'
          : 'po-detail'
        : segment === 'statements'
          ? 'statement-detail'
          : segment === 'afters'
            ? 'after-detail'
            : 'order-detail'
    void wx.navigateTo({
      url: `/packages/${this.data.supplier ? 'supplier' : 'store'}/pages/${path}/index?id=${event.currentTarget.dataset.key}`,
    })
  },
}
export function externalBusinessPage(supplier: boolean, initial: Segment = 'orders') {
  const segmentTabs = supplier
    ? [
        { key: 'orders', text: copy.screen.title.purchaseOrders },
        { key: 'statements', text: f.statementTab },
      ]
    : [
        { key: 'orders', text: copy.screen.title.storeOrders },
        { key: 'afters', text: copy.screen.title.storeAfters },
        { key: 'statements', text: f.statementTab },
      ]
  return {
    ...methods,
    data: {
      ...data,
      supplier,
      segment: initial,
      segmentTabs,
      title: supplier ? copy.screen.title.purchaseOrders : copy.screen.title.storeOrders,
    },
  }
}
