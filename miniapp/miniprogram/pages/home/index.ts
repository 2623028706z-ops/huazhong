// M3 花众首页（06 章 M3）：管理员和多模块员工的落点。字标 + 身份行 → 两列入口卡（按 modules），不显示待办
import { labels, type ModuleKey } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { moduleIcons } from '../../core/module-icons'
import { failureOf, identityOf, loadMe, logout, moduleHomeUrl, tabsOf } from '../../core/session'

Page({
  data: {
    lead: '',
    person: '',
    entries: [] as { key: string; icon: string; text: string; disabled: boolean }[],
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
    const me = result.data
    this.setData({
      ...identityOf(me),
      tabs: tabsOf(me),
      entries: me.modules.map((key) => ({
        key,
        icon: moduleIcons[key],
        text: labels.module[key],
        disabled: false,
      })),
      failure: null,
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
