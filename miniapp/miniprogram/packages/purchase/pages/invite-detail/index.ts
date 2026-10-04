import { contract, copy, type InviteDetail } from '@huazhong/shared'
import { buttonsOf, canDo, type ButtonView } from '../../../../core/actions'
import type { CodeEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk } from '../../../../core/guard'
import { unwatchOnLeave, watchNewer, pullToRefresh } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { inviteViewOf, openInvitePo } from '../../../../views/invite-detail'

Page({
  ...pullToRefresh,
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.invite,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof inviteViewOf> | null,
    buttons: [] as ButtonView[],
    busy: '',
    error: '',
    share: null as { title: string; path: string; imageUrl: string } | null,
  },
  id: '',
  invite: null as InviteDetail | null,
  loadVersion: 0,
  shareAsked: false,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
    watchNewer(
      this,
      `invite:${this.id}`,
      () => this.invite?.version,
      () => void this.load(),
    )
  },
  async load() {
    const seq = ++this.loadVersion
    const result = await request(contract.getInvite, { params: { id: this.id } })
    if (seq !== this.loadVersion) return
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.invite = result.data
    const buttons = buttonsOf(result.data.actions, [
      { code: 'editInvite', secondary: true },
      { code: 'shareInvite' },
      { code: 'cancelInvite', secondary: true },
    ]).map((button) =>
      button.code === 'shareInvite'
        ? { ...button, text: copy.screen.action.shareToSupplier }
        : button,
    )
    this.setData({
      loaded: true,
      failure: null,
      view: inviteViewOf(result.data),
      buttons,
    })
    if (canDo(result.data.actions, 'shareInvite')) void this.loadShare()
  },
  onFailureAction() {
    void this.load()
  },
  onAction(event: CodeEvent) {
    const code = event.currentTarget.dataset.code
    if (!this.invite || this.data.busy) return
    if (code === 'editInvite') {
      void wx.navigateTo({ url: `/packages/purchase/pages/invite-form/index?id=${this.id}` })
    } else if (code === 'cancelInvite') {
      void this.cancel()
    }
  },
  // 「发给供应商」要一点就转发，所以卡片参数在进页面时取好（每个页面只取一次；服务端同一邀请只在第一次生成时记一条日志）
  async loadShare() {
    if (this.shareAsked) return
    this.shareAsked = true
    const result = await request(contract.shareInvite, { params: { id: this.id } })
    if (result.ok) this.setData({ share: result.data })
    else {
      this.shareAsked = false
      this.setData({ error: failureOf(result.failure, 'refresh')?.message ?? '' })
    }
  },
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    return (
      this.data.share ?? {
        title: copy.finance.inviteShareTitle,
        path: '/packages/supplier/pages/invites/index',
      }
    )
  },
  onPo() {
    openInvitePo(this.invite, false)
  },
  async cancel() {
    if (!this.invite || this.data.busy) return
    const invite = this.invite
    const confirmed = await confirmAsk(this, {
      title: copy.screen.action.cancelInvite,
      body: copy.screen.cancelInviteBody,
      cancel: copy.action.back,
      confirm: copy.screen.action.confirmCancel,
    })
    if (!confirmed) return
    this.setData({ busy: 'cancelInvite', error: '' })
    const result = await request(contract.cancelInvite, {
      params: { id: this.id },
      body: { version: invite.version },
    })
    this.setData({ busy: '' })
    if (result.ok) {
      await this.load()
      showSuccess(copy.action.saved)
      return
    }
    const failure = failureOf(result.failure, 'submit')
    if (failure?.kind === 'stale') await this.load()
    this.setData({ error: failure ? messageOf(failure) : '' })
  },
})
