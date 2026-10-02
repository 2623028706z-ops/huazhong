import { contract, copy, poStatuses, type PoCard, type SupplierPoDetail } from '@huazhong/shared'
import { buttonsOf, hasAction, type ButtonView } from '../core/actions'
import type { KeyEvent, CodeEvent, DetailEvent } from '../core/events'
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
  detailVersion: 0,
  detailButtons: [] as ButtonView[],
  cancelSheet: false,
  cancelBusy: false,
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
    if (this.data.sheet) void this.open(this.data.detailId)
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
    if (result.ok)
      this.setData({
        view: poViewOf(result.data, true),
        detailVersion: result.data.version,
        detailButtons: buttonsOf(result.data.actions, [
          { code: 'supplierCancelPo', secondary: true },
          { code: 'supplierEditPo' },
        ]),
      })
    else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: false })
  },
  onCreate() {
    void wx.navigateTo({ url: '/packages/purchase/pages/order-form/index' })
  },
  onAction(this: Host, event: CodeEvent) {
    if (this.data.kind !== 'supplier') return
    if (event.currentTarget.dataset.code === 'supplierEditPo') {
      void wx.navigateTo({
        url: `/packages/supplier/pages/supply/index?poId=${this.data.detailId}`,
      })
    } else if (event.currentTarget.dataset.code === 'supplierCancelPo')
      this.setData({ cancelSheet: true, sheetError: '' })
  },
  onCloseCancel(this: Host) {
    this.setData({ cancelSheet: false })
  },
  async onCancel(this: Host, event: DetailEvent<string>) {
    this.setData({ cancelBusy: true, sheetError: '' })
    const result = await request(contract.supplierCancelPurchaseOrder, {
      params: { id: this.data.detailId },
      body: { version: this.data.detailVersion, reason: event.detail },
    })
    this.setData({ cancelBusy: false })
    if (result.ok) {
      this.setData({ cancelSheet: false })
      await this.open(this.data.detailId)
      void this.list?.refresh()
      return
    }
    const failure = failureOf(result.failure, 'submit')
    if (failure?.kind === 'stale') {
      const latest = failure.latest as SupplierPoDetail
      this.setData({
        view: poViewOf(latest, true),
        detailVersion: latest.version,
        detailButtons: buttonsOf(latest.actions, [
          { code: 'supplierCancelPo', secondary: true },
          { code: 'supplierEditPo' },
        ]),
      })
    }
    this.setData({ sheetError: failure?.message ?? '' })
  },
}
export const poListPage = { ...methods, data }
