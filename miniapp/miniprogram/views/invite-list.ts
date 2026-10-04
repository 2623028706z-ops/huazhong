import { contract, copy, redesignCopy, inviteStatuses, type InviteCard } from '@huazhong/shared'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterDimension } from '../core/filter'
import type { PagedList } from '../core/list'
import { unwatch, watch } from '../core/live'
import { request } from '../core/request'
import { loadMe, tabsOf } from '../core/session'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { inviteRowOf } from './purchase'
import { loadSupplierDimensions } from './purchase-load'

const embeddedStatuses = ['pending', 'cancelled'] as const
const data = {
  supplier: false,
  embedded: false,
  title: copy.screen.title.invites as string,
  statusKind: 'inviteStatus',
  statuses: [...inviteStatuses] as string[],
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
  visible?: boolean
  setData(patch: Record<string, unknown>): void
  loadDimensions(): Promise<void>
}
function isHere(host: InviteListHost) {
  return host.visible === true
}
// 供应商端：填报标签的待填报红点 + 默认停在哪个状态
async function showSupplier(host: InviteListHost) {
  const me = await loadMe()
  if (!me.ok || !isHere(host)) return
  const result = await request(contract.supplierInvites, { query: { status: 'pending' } })
  // 等接口时已经离开页面：不再订阅，否则没人退订
  if (!isHere(host)) return
  if (result.ok) {
    const pending = result.data.counts.pending ?? 0
    host.setData({
      tabs: tabsOf(me.data, pending),
      ...(host.data.defaultChosen
        ? {}
        : {
            filter: { ...host.data.filter, status: pending > 0 ? 'pending' : '' },
            defaultChosen: true,
          }),
    })
  }
  void host.list?.refresh()
  watch(host, [`supplier:${me.data.supplierId ?? ''}`], () => void host.list?.refresh())
}
// 嵌在采购需求「待填报」里：只有待填报 / 已取消两种状态，默认待填报，没有日期筛选
function embeddedPatch(host: InviteListHost, status: string | undefined) {
  host.setData({
    statuses: [...embeddedStatuses],
    dateLabel: '',
    filter: { ...host.data.filter, status: status ?? 'pending' },
    defaultChosen: true,
  })
}
const methods = {
  ...listHandlers,
  list: null as PagedList<InviteCard> | null,
  onLoad(this: InviteListHost, query: Record<string, string | undefined>) {
    if (query.supplierId)
      this.setData({ filter: { ...emptyFilter, picks: { supplier: query.supplierId } } })
    if (query.status)
      this.setData({ filter: { ...this.data.filter, status: query.status }, defaultChosen: true })
    if (this.data.embedded) embeddedPatch(this, query.status)
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, picks, from, to, q } = listQueryOf<InviteCard['status']>(this.data.filter)
        const result = await request(
          this.data.supplier ? contract.supplierInvites : contract.listInvites,
          {
            query: {
              status: status ?? (this.data.embedded ? 'pending' : undefined),
              from,
              to,
              supplierId: picks.supplier,
              cursor,
            },
          },
        )
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            tabs: this.data.tabs.map((tab) =>
              tab.key === 'supply' ? { ...tab, badge: result.data.counts.pending ?? 0 } : tab,
            ),
          })
        // 接口没有搜索词，按供应商名、花材名在本页结果里筛
        if (result.ok && q)
          return {
            ...result,
            data: {
              ...result.data,
              items: result.data.items.filter((item) =>
                [item.supplierName, ...item.materialNames].some((text) => text.includes(q)),
              ),
            },
          }
        return result
      },
      (invite) => inviteRowOf(invite, this.data.supplier),
    )
    if (!this.data.supplier) void this.loadDimensions()
  },
  async onShow(this: InviteListHost) {
    this.visible = true
    if (!this.data.supplier) {
      showList(this, ['invites'])
      return
    }
    await showSupplier(this)
  },
  loadDimensions: loadSupplierDimensions,
  onHide(this: InviteListHost) {
    this.visible = false
    unwatch(this)
  },
  onUnload(this: InviteListHost) {
    this.visible = false
    unwatch(this)
  },
  onOpen(this: InviteListHost, event: KeyEvent) {
    const path = this.data.supplier ? 'supplier/pages/supply' : 'purchase/pages/invite-detail'
    void wx.navigateTo({ url: `/packages/${path}/index?id=${event.currentTarget.dataset.key}` })
  },
}
export const inviteListData = data
export const inviteListMethods = methods
// 页面版（供应商填报）不带分段；组件版用属性传进来
export const inviteListPage = {
  ...methods,
  data: { ...data, sections: [], section: '', searchPlaceholder: '' },
}
