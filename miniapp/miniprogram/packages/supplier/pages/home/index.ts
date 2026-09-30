// P0 供应商首页（06 章 P0）：字标 + 身份行 → 主卡「填报」→ 采购单、对账。
// 阶段 2 这些卡还没有页面，照常显示但变淡不能点；待填报数在阶段 4 接入（08 章）
import { copy } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { failureOf, identityOf, loadMe, logout, tabsOf } from '../../../../core/session'

const hero = {
  key: 'supply',
  icon: 'clipboard-pen',
  text: copy.hub.supply,
  sub: '',
  badge: 0,
  disabled: true,
}
const minis = [
  { key: 'purchaseOrders', icon: 'file-text', text: copy.hub.purchaseOrders, disabled: true },
  { key: 'statement', icon: 'notebook-text', text: copy.hub.statement, disabled: true },
]

Page({
  data: {
    lead: '',
    person: '',
    hero,
    minis,
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
  },
  onShow() {
    void this.load()
  },
  async load() {
    const result = await loadMe()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    this.setData({ ...identityOf(result.data), tabs: tabsOf(result.data), failure: null })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
