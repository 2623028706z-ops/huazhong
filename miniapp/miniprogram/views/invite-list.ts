import { contract, copy, redesignCopy, inviteStatuses, type InviteCard } from '@huazhong/shared'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterDimension } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch } from '../core/live'
import { request } from '../core/request'
import { loadMe, tabsOf } from '../core/session'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { inviteRowOf } from './purchase'
import { loadSupplierDimensions } from './purchase-load'

const data = {
  supplier: false,
  title: copy.screen.title.invites as string,
  statusKind: 'inviteStatus',
  statuses: [...inviteStatuses],
  counts: {},
  dateLabel: redesignCopy.inviteDate,
  defaultChosen: false,
  filter: emptyFilter,
  dimensions: [] as FilterDimension[],
  rows: [] as ReturnType<typeof inviteRowOf>[],
  tabs: [] as ReturnType<typeof tabsOf>,
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: copy.screen.empty.invites,
  allLoaded: copy.state.allLoaded,
}
export interface InviteListHost {
  data: typeof data
  list: PagedList<InviteCard> | null
  setData(patch: Record<string, unknown>): void
  loadDimensions(): Promise<void>
}
const methods = {
  ...listHandlers,
  list: null as PagedList<InviteCard> | null,
  onLoad(this: InviteListHost, query: Record<string, string | undefined>) {
    if (query.supplierId)
      this.setData({ filter: { ...emptyFilter, picks: { supplier: query.supplierId } } })
    if (query.status)
      this.setData({ filter: { ...this.data.filter, status: query.status }, defaultChosen: true })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, picks, from, to } = listQueryOf<InviteCard['status']>(this.data.filter)
        const result = await request(
          this.data.supplier ? contract.supplierInvites : contract.listInvites,
          { query: { status, from, to, supplierId: picks.supplier, cursor } },
        )
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            tabs: this.data.tabs.map((tab) =>
              tab.key === 'supply' ? { ...tab, badge: result.data.counts.pending ?? 0 } : tab,
            ),
          })
        return result
      },
      inviteRowOf,
    )
    if (!this.data.supplier) void this.loadDimensions()
  },
  async onShow(this: InviteListHost) {
    if (!this.data.supplier) {
      showList(this, ['invites'])
      return
    }
    const me = await loadMe()
    if (!me.ok) return
    const result = await request(contract.supplierInvites, { query: { status: 'pending' } })
    if (result.ok) {
      this.setData({
        tabs: tabsOf(me.data, result.data.counts.pending ?? 0),
        ...(this.data.defaultChosen
          ? {}
          : {
              filter: {
                ...this.data.filter,
                status: (result.data.counts.pending ?? 0) > 0 ? 'pending' : '',
              },
              defaultChosen: true,
            }),
      })
    }
    void this.list?.refresh()
    watch(this, [`supplier:${me.data.supplierId ?? ''}`], () => void this.list?.refresh())
  },
  loadDimensions: loadSupplierDimensions,
  onOpen(this: InviteListHost, event: KeyEvent) {
    const path = this.data.supplier ? 'supplier/pages/supply' : 'purchase/pages/invite-detail'
    void wx.navigateTo({ url: `/packages/${path}/index?id=${event.currentTarget.dataset.key}` })
  },
}
export const inviteListPage = { ...methods, data }
