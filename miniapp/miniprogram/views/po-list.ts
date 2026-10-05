import { contract, copy, poStatuses, type PoCard } from '@huazhong/shared'
import { hasAction } from '../core/actions'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterDimension } from '../core/filter'
import type { PagedList } from '../core/list'
import { pullToRefresh } from '../core/live'
import { request } from '../core/request'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { poRowOf } from './purchase'
import { loadSupplierDimensions } from './purchase-load'

// 采购、仓库两端共用；供应商端的订单列表在 external-business，点卡片进 supplier/po-detail
const data = {
  kind: 'purchase' as 'purchase' | 'warehouse',
  title: copy.screen.title.purchaseOrders as string,
  statusKind: 'poStatus',
  statuses: [...poStatuses],
  counts: {},
  filter: emptyFilter,
  dimensions: [] as FilterDimension[],
  dateLabel: copy.screen.label.orderDate,
  searchPlaceholder: copy.screen.poSearch,
  rows: [] as ReturnType<typeof poRowOf>[],
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: copy.screen.empty.purchaseOrders,
  allLoaded: copy.state.allLoaded,
  canCreate: false,
  createText: copy.screen.title.createPo,
  // 采购端顶上两段「采购单 / 填报邀请」（06 章 C3）；仓库端没有分段
  segment: 'orders' as 'orders' | 'invites',
  segmentTabs: [
    { key: 'orders', text: copy.screen.title.purchaseOrders },
    { key: 'invites', text: copy.screen.label.inviteDocs },
  ],
  supplierId: '',
  inviteSearch: copy.screen.demandSearch,
}
interface Host {
  data: typeof data
  setData(patch: Record<string, unknown>): void
  list: PagedList<PoCard> | null
  loadDimensions(): Promise<void>
}
const methods = {
  ...pullToRefresh,
  ...listHandlers,
  list: null as PagedList<PoCard> | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    if (query.supplierId)
      this.setData({
        supplierId: query.supplierId,
        filter: { ...this.data.filter, picks: { supplier: query.supplierId } },
      })
    if (query.segment === 'invites' && this.data.kind === 'purchase')
      this.setData({ segment: 'invites' })
    if (query.status) this.setData({ filter: { ...this.data.filter, status: query.status } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to, picks, q } = listQueryOf<PoCard['status']>(this.data.filter)
        const result = await request(contract.listPurchaseOrders, {
          query: { status, from, to, q, supplierId: picks.supplier, cursor },
        })
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            canCreate: hasAction(result.data.actions, 'create'),
          })
        return result
      },
      (po) => poRowOf(po, false),
    )
    void this.loadDimensions()
  },
  onShow(this: Host) {
    showList(this, ['pos'])
  },
  loadDimensions: loadSupplierDimensions,
  onSegment(this: Host, event: DetailEvent<string>) {
    this.setData({ segment: event.detail === 'invites' ? 'invites' : 'orders' })
  },
  onOpen(this: Host, event: KeyEvent) {
    const page =
      this.data.kind === 'warehouse' ? 'warehouse/pages/receive' : 'purchase/pages/order-detail'
    void wx.navigateTo({ url: `/packages/${page}/index?id=${event.currentTarget.dataset.key}` })
  },
  onCreate() {
    void wx.navigateTo({ url: '/packages/purchase/pages/order-form/index' })
  },
}
export const poListPage = { ...methods, data }
