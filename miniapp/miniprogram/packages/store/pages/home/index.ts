// S0 门店首页（06 章 S0）：字标 + 身份行 → 主卡「订货」→ 订单、售后、对账。客户停用时身份行下面写 lockedReason。
// 阶段 2 这些卡还没有页面，照常显示但变淡不能点（08 章）；可订款数在阶段 3 接入
import { contract, copy } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf, identityOf, loadMe, logout, tabsOf } from '../../../../core/session'

const hero = {
  key: 'order',
  icon: 'shopping-bag',
  text: copy.hub.order,
  sub: '',
  badge: 0,
  disabled: true,
}
const minis = [
  { key: 'orders', icon: 'file-text', text: copy.hub.orders, disabled: true },
  { key: 'afters', icon: 'rotate-ccw', text: copy.hub.afters, disabled: true },
  { key: 'statement', icon: 'notebook-text', text: copy.hub.statement, disabled: true },
]

Page({
  data: {
    lead: '',
    person: '',
    hero,
    minis,
    notice: '',
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
  },
  onShow() {
    void this.load()
  },
  async load() {
    const [me, home] = await Promise.all([loadMe(), request(contract.storeHome)])
    if (!me.ok || !home.ok) {
      const failure = !me.ok ? me.failure : !home.ok ? home.failure : null
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.setData({
      ...identityOf(me.data),
      tabs: tabsOf(me.data),
      notice: home.data.lockedReason ?? '',
      failure: null,
    })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
