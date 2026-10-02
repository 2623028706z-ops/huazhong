import { contract, copy, poStatuses, type PoCard } from '@huazhong/shared'
import { hasAction } from '../core/actions'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterDimension } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch } from '../core/live'
import { request } from '../core/request'
import { failureOf, loadMe } from '../core/session'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { poRowOf, poViewOf } from './purchase'
import { loadSupplierDimensions } from './purchase-load'

const data = {
  kind: 'purchase' as 'purchase' | 'warehouse' | 'supplier',
  title: copy.screen.title.purchaseOrders as string,
  statusKind: 'poStatus',
  statuses: [...poStatuses],
  counts: {},
  filter: emptyFilter,
  dimensions: [] as FilterDimension[],
  dateLabel: copy.screen.label.orderDate,
  rows: [] as ReturnType<typeof poRowOf>[],
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: copy.screen.empty.purchaseOrders,
  allLoaded: copy.state.allLoaded,
  canCreate: false,
  createText: copy.screen.title.createPo,
  sheet: false,
  sheetError: '',
  view: null as ReturnType<typeof poViewOf> | null,
  detailId: '',
}
interface Host {
  data: typeof data
  setData(patch: Record<string, unknown>): void
  list: PagedList<PoCard> | null
  loadDimensions(): Promise<void>
  open(id: string): Promise<void>
}
const methods = {
  ...listHandlers,
  list: null as PagedList<PoCard> | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    if (this.data.kind === 'supplier' && query.id) {
      this.setData({ sheet: true, detailId: query.id })
      void this.open(query.id)
    }
    if (query.status) this.setData({ filter: { ...this.data.filter, status: query.status } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to, picks } = listQueryOf<PoCard['status']>(this.data.filter)
        const input = { query: { status, from, to, supplierId: picks.supplier, cursor } }
        const result = await request(
          this.data.kind === 'supplier'
            ? contract.supplierPurchaseOrders
            : contract.listPurchaseOrders,
          input,
        )
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            canCreate: hasAction(result.data.actions, 'create'),
          })
        return result
      },
      poRowOf,
    )
    if (this.data.kind !== 'supplier') void this.loadDimensions()
  },
  async onShow(this: Host) {
    if (this.data.kind !== 'supplier') {
      showList(this, ['pos'])
      return
    }
    void this.list?.refresh()
    const me = await loadMe()
    if (me.ok)
      watch(this, [`supplier:${me.data.supplierId ?? ''}`], () => {
        void this.list?.refresh()
        if (this.data.sheet) void this.open(this.data.detailId)
      })
  },
  loadDimensions: loadSupplierDimensions,
  async onOpen(this: Host, event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (this.data.kind !== 'supplier') {
      const page =
        this.data.kind === 'warehouse' ? 'warehouse/pages/receive' : 'purchase/pages/order-detail'
      void wx.navigateTo({ url: `/packages/${page}/index?id=${id}` })
      return
    }
    this.setData({ sheet: true, view: null, sheetError: '', detailId: id })
    await this.open(id)
  },
  async open(this: Host, id: string) {
    const result = await request(contract.supplierPurchaseOrder, { params: { id } })
    if (result.ok) this.setData({ view: poViewOf(result.data, true) })
    else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: false })
  },
  onCreate() {
    void wx.navigateTo({ url: '/packages/purchase/pages/order-form/index' })
  },
}
export const poListPage = { ...methods, data }
