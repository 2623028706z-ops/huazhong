// M3 花众首页（06 章 M3）：管理员和多模块员工的落点。字标 + 身份行 → 两列入口卡（按 modules），格子右上角是该模块待办总数（0 不显示）
import { contract, labels, type ModuleKey } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { moduleIcons } from '../../core/module-icons'
import { failureOf, identityOf, loadMe, logout, moduleHomeUrl, tabsOf } from '../../core/session'
import { pullToRefresh, unwatch, watch } from '../../core/live'
import { request } from '../../core/request'

Page({
  ...pullToRefresh,
  data: {
    lead: '',
    person: '',
    entries: [] as {
      key: string
      icon: string
      text: string
      disabled: boolean
      badge: number
    }[],
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
    const result = await loadMe()
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const me = result.data
    this.setData({
      ...identityOf(me),
      tabs: tabsOf(me),
      entries: me.modules.map((key) => ({
        key,
        icon: moduleIcons[key],
        text: labels.module[key],
        disabled: false,
        // 刷新时沿用旧数字，避免角标闪一下消失
        badge: this.data.entries.find((entry) => entry.key === key)?.badge ?? 0,
      })),
      failure: null,
    })
    watch(this, ['todo:*'], () => void this.loadBadges())
    await this.loadBadges()
  },
  // 角标取不到不影响入口：静默保留旧数字
  async loadBadges() {
    const result = await request(contract.moduleTodoCounts)
    if (!result.ok) return
    const counts = new Map(result.data.counts.map((row) => [row.key as string, row.count]))
    this.setData({
      entries: this.data.entries.map((entry) => ({ ...entry, badge: counts.get(entry.key) ?? 0 })),
    })
  },
  onSelect(event: DetailEvent<ModuleKey>) {
    void wx.navigateTo({ url: moduleHomeUrl(event.detail) })
  },
  onFailureAction(event: DetailEvent<string>) {
    if (event.detail === 'logout') void logout()
    else void this.load()
  },
})
