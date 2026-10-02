import {
  contract,
  copy,
  inviteStatuses,
  type InviteCard,
  type InviteDetail,
} from '@huazhong/shared'
import { buttonsOf, type ButtonView } from '../core/actions'
import type { CodeEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter, type FilterDimension } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch } from '../core/live'
import { request } from '../core/request'
import { failureOf, messageOf, loadMe, tabsOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { inviteRowOf } from './purchase'
import { inviteViewOf } from './invite-detail'
import { loadSupplierDimensions } from './purchase-load'

const data = {
  supplier: false,
  title: copy.screen.title.invites as string,
  statusKind: 'inviteStatus',
  statuses: [...inviteStatuses],
  counts: {},
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
  sheet: '' as '' | 'detail' | 'cancel' | 'share',
  view: null as ReturnType<typeof inviteViewOf> | null,
  sheetError: '',
  busy: '',
  buttons: [] as ButtonView[],
  share: null as { title: string; path: string; imageUrl: string } | null,
  texts: {
    detail: copy.screen.title.invite,
    share: copy.screen.action.supplyLink,
    send: copy.screen.action.sendSupply,
    copy: copy.screen.action.copyLink,
    cancel: copy.screen.action.cancelInvite,
    confirm: copy.screen.action.confirmCancel,
  },
}
interface Host {
  data: typeof data
  list: PagedList<InviteCard> | null
  invite: InviteDetail | null
  id: string
  setData(patch: Record<string, unknown>): void
  loadDimensions(): Promise<void>
  open(id: string): Promise<void>
  show(invite: InviteDetail): void
}
const methods = {
  ...listHandlers,
  list: null as PagedList<InviteCard> | null,
  invite: null as InviteDetail | null,
  id: '',
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    if (query.status) this.setData({ filter: { ...emptyFilter, status: query.status } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, picks } = listQueryOf<InviteCard['status']>(this.data.filter)
        const endpoint = this.data.supplier ? contract.supplierInvites : contract.listInvites
        const result = await request(endpoint, {
          query: { status, supplierId: picks.supplier, cursor },
        })
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            tabs: this.data.tabs.map((t) =>
              t.key === 'supply' ? { ...t, badge: result.data.counts.pending ?? 0 } : t,
            ),
          })
        return result
      },
      inviteRowOf,
    )
    if (!this.data.supplier) void this.loadDimensions()
  },
  async onShow(this: Host) {
    if (!this.data.supplier) showList(this, ['invites'])
    else void this.list?.refresh()
    if (this.data.supplier) {
      const me = await loadMe()
      const invites = await request(contract.supplierInvites, { query: { status: 'pending' } })
      if (me.ok && invites.ok) {
        this.setData({ tabs: tabsOf(me.data, invites.data.counts.pending ?? 0) })
        watch(this, [`supplier:${me.data.supplierId ?? ''}`], () => void this.list?.refresh())
      }
    }
    if (this.id) {
      void this.open(this.id)
      this.id = ''
    }
  },
  loadDimensions: loadSupplierDimensions,
  onOpen(this: Host, event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (this.data.supplier) {
      void wx.navigateTo({ url: `/packages/supplier/pages/supply/index?id=${id}` })
      return
    }
    void this.open(id)
  },
  async open(this: Host, id: string) {
    this.setData({ sheet: 'detail', view: null, sheetError: '' })
    const result = await request(contract.getInvite, { params: { id } })
    if (result.ok) this.show(result.data)
    else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  show(this: Host, invite: InviteDetail) {
    this.invite = invite
    this.setData({
      view: inviteViewOf(invite),
      buttons: buttonsOf(invite.actions, [
        { code: 'cancelInvite', secondary: true },
        { code: 'shareInvite', secondary: true },
        { code: 'editInvite' },
      ]).map((b) => (b.code === 'shareInvite' ? { ...b, text: copy.screen.action.supplyLink } : b)),
    })
  },
  async onAction(this: Host, event: CodeEvent) {
    if (!this.invite) return
    const id = this.invite.id,
      code = event.currentTarget.dataset.code
    if (code === 'cancelInvite') {
      this.setData({ sheet: 'cancel', sheetError: '' })
      return
    }
    if (code === 'editInvite') {
      this.setData({ sheet: '' })
      void wx.navigateTo({
        url: `/packages/purchase/pages/invite-form/index?id=${id}`,
        events: {
          saved: () => {
            this.id = id
          },
        },
      })
      return
    }
    if (code === 'shareInvite') {
      this.setData({ sheet: 'share', sheetError: '', share: null })
      const result = await request(contract.shareInvite, { params: { id } })
      if (result.ok) this.setData({ share: result.data })
      else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
    }
  },
  onBackSheet(this: Host) {
    this.setData({ sheet: 'detail', sheetError: '' })
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: '', sheetError: '' })
  },
  onCopyLink(this: Host) {
    if (this.data.share) void wx.setClipboardData({ data: this.data.share.path })
  },
  onShareAppMessage(this: Host): WechatMiniprogram.Page.ICustomShareContent {
    return (
      this.data.share ?? {
        title: copy.finance.inviteShareTitle,
        path: '/packages/supplier/pages/home/index',
      }
    )
  },
  onPo(this: Host) {
    const id = this.invite?.purchaseOrderId
    if (!id) return
    this.setData({ sheet: '' })
    void wx.navigateTo({ url: `/packages/purchase/pages/order-detail/index?id=${id}` })
  },
  async onCancel(this: Host) {
    if (!this.invite) return
    this.setData({ busy: 'cancelInvite', sheetError: '' })
    const result = await request(contract.cancelInvite, {
      params: { id: this.invite.id },
      body: { version: this.invite.version },
    })
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData({ sheet: 'detail' })
      showSuccess(copy.action.saved)
      void this.list?.refresh()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') this.show(view.latest as InviteDetail)
    this.setData({ sheetError: messageOf(view) })
  },
}
export const inviteListPage = { ...methods, data }
