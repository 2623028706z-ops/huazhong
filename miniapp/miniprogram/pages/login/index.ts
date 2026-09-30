// M1 登录（06 章 M1）：小程序先进这里。已绑定按 landing 直接进；没绑定显示登录区；停用显示停用状态。
// 隐私保护指引没勾选时点按钮只提示、勾选框抖动，不弹手机号授权（03 章第 8.5 节）
import { contract, copy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import { viewOf, type FailureView } from '../../core/failure-view'
import { realtime } from '../../core/live'
import { request, type Failure } from '../../core/request'
import { landingUrl, loadMe, logout } from '../../core/session'
import type { Me } from '@huazhong/shared'

const SHAKE_MS = 400
// 同意隐私保护指引和手机号快速验证在一次点击里完成（基础库 2.32.3 起）
const PHONE_OPEN_TYPE = 'getPhoneNumber|agreePrivacyAuthorization'

function enter(me: Me): void {
  realtime.start()
  void wx.reLaunch({ url: landingUrl(me) })
}

Page({
  data: {
    phase: 'checking',
    agreed: false,
    shaking: false,
    busy: false,
    error: '',
    requestId: '',
    failure: null as FailureView | null,
    openType: '',
    texts: {
      button: copy.auth.loginButton,
      prefix: copy.auth.privacyPrefix,
      contract: copy.auth.privacyContract,
    },
  },
  onLoad() {
    void this.check()
  },
  async check() {
    const result = await loadMe()
    if (result.ok) {
      enter(result.data)
      return
    }
    this.showFailure(result.failure)
  },
  // 没绑定 → 登录区；停用、断网 → 整页状态；其余写在按钮上方
  showFailure(failure: Failure) {
    const view = viewOf(failure, 'load')
    if (view.kind === 'login') this.setData({ phase: 'login', failure: null })
    else if (view.kind === 'page') this.setData({ phase: 'failure', failure: view })
    else this.setData({ phase: 'login', error: view.message, requestId: '' })
  },
  onToggleAgree() {
    const agreed = !this.data.agreed
    this.setData({ agreed, openType: agreed ? PHONE_OPEN_TYPE : '', error: '' })
  },
  onOpenContract() {
    wx.openPrivacyContract({})
  },
  // 没勾选：按钮没有 open-type，点了只走这里
  onPress() {
    if (this.data.agreed) return
    this.setData({ error: copy.auth.privacyRequired, shaking: true })
    setTimeout(() => {
      this.setData({ shaking: false })
    }, SHAKE_MS)
  },
  // 用户在授权框里点了拒绝：detail 为空，留在本页不报错
  async onPhone(event: DetailEvent<string>) {
    const code = event.detail
    if (!code) return
    this.setData({ busy: true, openType: '', error: '', requestId: '' })
    const result = await request(contract.bindPhone, { body: { code } })
    this.setData({ busy: false, openType: this.data.agreed ? PHONE_OPEN_TYPE : '' })
    if (result.ok) {
      enter(result.data)
      return
    }
    const view = viewOf(result.failure, 'submit')
    if (view.kind === 'page') this.setData({ phase: 'failure', failure: view })
    else if (view.kind !== 'login') {
      const requestId = view.kind === 'inline' ? (view.requestId ?? '') : ''
      this.setData({ error: view.message, requestId })
    }
  },
  // 停用状态的「退出登录」、断网的「重试」
  async onFailureAction(event: DetailEvent<string>) {
    if (event.detail !== 'logout') {
      void this.check()
      return
    }
    const failure = await logout()
    if (failure) this.showFailure(failure)
  },
})
