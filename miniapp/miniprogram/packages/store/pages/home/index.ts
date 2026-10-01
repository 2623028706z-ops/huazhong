// S0 门店首页（06 章 S0）：字标 + 身份行 → 主卡「订货」（今日可订 n 款）→ 订单、售后、对账。
// 客户停用时身份行下面写 lockedReason，「订货」卡变灰不能点；订单、售后、对账照常
import { contract, copy, type StoreHome } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, request } from '../../../../core/request'
import { failureOf, identityOf, loadMe, logout, tabsOf } from '../../../../core/session'

const PAGES = '/packages/store/pages'
const targets: Record<string, string> = {
  order: `${PAGES}/shop/index`,
  orders: `${PAGES}/orders/index`,
  afters: `${PAGES}/afters/index`,
  statement: `${PAGES}/statement/index`,
}

const minis = [
  { key: 'orders', icon: 'file-text', text: copy.hub.orders, disabled: false },
  { key: 'afters', icon: 'rotate-ccw', text: copy.hub.afters, disabled: false },
  { key: 'statement', icon: 'notebook-text', text: copy.hub.statement, disabled: false },
]

function heroOf(home: StoreHome) {
  return {
    key: 'order',
    icon: 'shopping-bag',
    text: copy.hub.order,
    sub: home.lockedReason ? '' : copy.store.orderableCount(home.orderableCount),
    badge: 0,
    disabled: home.lockedReason !== null,
  }
}

Page({
  data: {
    lead: '',
    person: '',
    hero: null as ReturnType<typeof heroOf> | null,
    minis,
    notice: '',
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
  },
  onShow() {
    void this.load()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
  },
  async load() {
    const [me, home] = await Promise.all([loadMe(), request(contract.storeHome)])
    if (!me.ok || !home.ok) {
      const failure = firstFailure([me, home])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.setData({
      ...identityOf(me.data),
      tabs: tabsOf(me.data),
      hero: heroOf(home.data),
      notice: home.data.lockedReason ?? '',
      failure: null,
    })
    // 客户停用、目录变了（可订款数）
    watch(this, [`catalog:${home.data.customerId}`], () => void this.load())
  },
  onSelect(event: DetailEvent<string>) {
    const url = targets[event.detail]
    if (url) void wx.navigateTo({ url })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
