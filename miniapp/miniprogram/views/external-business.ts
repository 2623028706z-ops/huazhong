import {
  contract,
  copy,
  financeCopy as f,
  financeTexts,
  type Topic,
  type OrderStatus,
  type AfterStatus,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterValue } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch, unwatchOnLeave } from '../core/live'
import { request } from '../core/request'
import { loadMe, tabsOf } from '../core/session'
import { listOf, listQueryOf } from './list'
import { orderRowOf } from './order'
import { afterRowOf } from './after'
import { poRowOf } from './purchase'
import { statementRowOf, type FinanceRow } from './statement'
type Segment = 'orders' | 'afters' | 'statements'
interface SegmentState {
  filter: FilterValue
  rows: FinanceRow[]
  counts: Record<string, number>
  loaded: boolean
  skeleton: boolean
  done: boolean
  failure: FailureView | null
  scrollTop: number
  cells: { label: string; amountCents: number; due: boolean }[]
}
function blank(): SegmentState {
  return {
    filter: { ...emptyFilter },
    rows: [],
    counts: {},
    loaded: false,
    skeleton: false,
    done: false,
    failure: null,
    scrollTop: 0,
    cells: [],
  }
}
const data = {
  ...blank(),
  title: copy.screen.title.storeOrders as string,
  supplier: false,
  segment: 'orders' as Segment,
  segmentTabs: [] as { key: string; text: string }[],
  statusKind: '',
  statuses: [] as string[],
  dateLabel: '',
  emptyObject: '',
  tabs: [] as ReturnType<typeof tabsOf>,
  allLoaded: copy.state.allLoaded,
  texts: financeTexts,
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
      emptyObject: f.noStatements,
    }
  if (segment === 'afters')
    return {
      statusKind: 'afterStatus',
      statuses: ['pending', 'processed', 'closed', 'voided'],
      dateLabel: copy.screen.label.afterDate,
      emptyObject: copy.screen.empty.afters,
    }
  return supplier
    ? {
        statusKind: 'poStatus',
        statuses: ['to_receive', 'received', 'rejected', 'cancelled'],
        dateLabel: copy.screen.label.orderDate,
        emptyObject: copy.screen.empty.purchaseOrders,
      }
    : {
        statusKind: 'orderStatus',
        statuses: ['pending_confirm', 'to_ship', 'shipped', 'cancelled'],
        dateLabel: copy.screen.label.orderDate,
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
      if (result.ok)
        viewHost.setData({
          counts: result.data.counts,
          ...('cells' in result.data ? { cells: result.data.cells } : {}),
        })
      return result
    },
    (row) => row,
  )
}
async function topicsOf(host: Host) {
  const me = await loadMe()
  if (!me.ok) return
  const supplierId = me.data.supplierId ?? ''
  if (host.data.supplier) {
    const invites = await request(contract.supplierInvites, { query: { status: 'pending' } })
    host.setData({ tabs: tabsOf(me.data, invites.ok ? (invites.data.counts.pending ?? 0) : 0) })
    subscribeLists(host, [`supplier:${supplierId}`, 'pos', `ap:${supplierId}`])
    return
  }
  const catalog = await request(contract.storeCatalog)
  host.setData({ tabs: tabsOf(me.data) })
  subscribeLists(host, [
    'orders',
    'afters',
    ...(catalog.ok ? [`ar:${catalog.data.customerId}` as const] : []),
  ])
}
function subscribeLists(host: Host, topics: Topic[]) {
  watch(host, topics, () => {
    for (const list of Object.values(host.lists)) void list.refresh()
  })
}
const methods = {
  ...unwatchOnLeave,
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
        { key: 'statements', text: f.statement },
      ]
    : [
        { key: 'orders', text: copy.screen.title.storeOrders },
        { key: 'afters', text: copy.screen.title.storeAfters },
        { key: 'statements', text: f.statement },
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
