// M2 链接落地（06 章 M2）：门店下单邀请不经过 M1，按 GET /store-invites/:token 依次判断：
// self → 直接进 S1；不是待使用 → 失效；other → 先去「我的」退出登录；none → 隐私勾选 + 手机号快速验证，成功进 S1。
// 供应商填报邀请在阶段 4 加（08 章）
import { contract, copy, labels, type StoreInviteView } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { realtime } from '../../core/live'
import { request } from '../../core/request'
import { failureOf } from '../../core/session'

const SHOP_URL = '/packages/store/pages/shop/index'
const MY_URL = '/pages/my/index'
// 同意隐私保护指引和手机号快速验证在一次点击里完成（同 M1）
const PHONE_OPEN_TYPE = 'getPhoneNumber|agreePrivacyAuthorization'

type Phase = 'checking' | 'invalid' | 'other' | 'login' | 'failure'

const INITIAL_PHASE = 'checking' as Phase

function enterShop(): void {
  realtime.start()
  void wx.reLaunch({ url: SHOP_URL })
}

Page({
  data: {
    phase: INITIAL_PHASE,
    failure: null as FailureView | null,
    invalidDetail: '',
    otherText: '',
    storeLabel: '',
    agreed: false,
    openType: '',
    busy: false,
    error: '',
    texts: {
      invite: copy.invite.storeTitle,
      button: copy.auth.loginButton,
      prefix: copy.auth.privacyPrefix,
      contract: copy.auth.privacyContract,
      goMy: copy.invite.goMy,
    },
  },
  token: '',
  onLoad(query: Record<string, string | undefined>) {
    this.token = query.t === 'store' ? (query.token ?? '') : ''
    void this.check()
  },
  async check(): Promise<void> {
    if (!this.token) {
      this.setData({ phase: 'invalid', invalidDetail: copy.invite.invalid })
      return
    }
    const result = await request(contract.getStoreInvite, { params: { token: this.token } })
    if (!result.ok) {
      const view = failureOf(result.failure, 'load')
      if (view?.kind === 'page' && view.state === 'notFound')
        this.setData({ phase: 'invalid', invalidDetail: copy.invite.invalid })
      else if (view) this.setData({ phase: 'failure', failure: view })
      return
    }
    this.show(result.data)
  },
  show(invite: StoreInviteView) {
    if (invite.binding === 'self') {
      enterShop()
      return
    }
    if (invite.status !== 'pending') {
      this.setData({ phase: 'invalid', invalidDetail: labels.storeInviteStatus[invite.status] })
      return
    }
    if (invite.binding === 'other') {
      this.setData({ phase: 'other', otherText: copy.invite.otherAccount(invite.boundLabel ?? '') })
      return
    }
    this.setData({ phase: 'login', storeLabel: invite.storeLabel })
  },
  onToggleAgree() {
    const agreed = !this.data.agreed
    this.setData({ agreed, openType: agreed ? PHONE_OPEN_TYPE : '', error: '' })
  },
  onOpenContract() {
    wx.openPrivacyContract({})
  },
  // 没勾选：按钮没有 open-type，点了只提示
  onPress() {
    if (!this.data.agreed) this.setData({ error: copy.auth.privacyRequired })
  },
  // 授权框里点了拒绝：detail 为空，留在本页不报错
  async onPhone(event: DetailEvent<string>): Promise<void> {
    const code = event.detail
    if (!code) return
    this.setData({ busy: true, error: '' })
    const result = await request(contract.useStoreInvite, {
      params: { token: this.token },
      body: { code },
    })
    this.setData({ busy: false })
    if (result.ok) {
      enterShop()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'page') this.setData({ phase: 'failure', failure: view })
    else if (view) this.setData({ error: view.message })
  },
  onGoMy() {
    void wx.reLaunch({ url: MY_URL })
  },
  onFailureAction() {
    void this.check()
  },
})
