// P0 供应商首页（06 章 P0）：字标 + 身份行 → 主卡「填报」→ 采购单、对账。
// 阶段 2 这些卡还没有页面，照常显示但变淡不能点；待填报数在阶段 4 接入（08 章）
import { contract, copy } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { failureOf, identityOf, loadMe, logout, tabsOf } from '../../../../core/session'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'

const hero = {
  key: 'supply',
  icon: 'clipboard-pen',
  text: copy.hub.supply,
  sub: '',
  badge: 0,
  disabled: false,
}
const minis = [
  { key: 'purchaseOrders', icon: 'file-text', text: copy.hub.purchaseOrders, disabled: false },
  { key: 'statement', icon: 'notebook-text', text: copy.hub.statement, disabled: false },
]

Page({
  ...unwatchOnLeave,
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
    const invites = await request(contract.supplierInvites, { query: { status: 'pending' } })
    if (!invites.ok) {
      this.setData({ failure: failureOf(invites.failure, 'load') })
      return
    }
    const count = invites.data.counts.pending ?? 0
    this.setData({
      ...identityOf(result.data),
      tabs: tabsOf(result.data, count),
      failure: null,
      hero: { ...hero, badge: count, sub: count ? copy.screen.supplyPending(count) : '' },
    })
    watch(this, [`supplier:${result.data.supplierId ?? ''}`], () => void this.load())
  },
  onSelect(event: DetailEvent<string>) {
    const pages: Record<string, string> = {
      supply: 'invites',
      purchaseOrders: 'orders',
      statement: 'statement',
    }
    const page = pages[event.detail]
    if (page) void wx.navigateTo({ url: `/packages/supplier/pages/${page}/index` })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
