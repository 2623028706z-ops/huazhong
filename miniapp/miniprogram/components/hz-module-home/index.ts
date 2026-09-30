// 模块首页（06 章第 1.1 节）：品牌背景淡化铺底 → 身份行 → 图标入口 → 待办。
// 只有一个模块的员工是一级页面（没有返回、有底栏），其余从花众首页进，是二级页面。
// 阶段 2 还没有入口和待办：入口随各模块页面做好再加，待办接口在各模块阶段接入（08 章）
import { labels, type ModuleKey } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { failureOf, identityOf, isLandingModule, loadMe, logout, tabsOf } from '../../core/session'

Component({
  properties: {
    module: { type: String, value: '' },
  },
  data: {
    title: '',
    back: true,
    roles: '',
    person: '',
    tabs: [] as ReturnType<typeof tabsOf>,
    failure: null as FailureView | null,
  },
  pageLifetimes: {
    show() {
      void this.load()
    },
  },
  methods: {
    async load() {
      const key = this.data.module as ModuleKey
      const result = await loadMe()
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'load') })
        return
      }
      const me = result.data
      const top = isLandingModule(me, key)
      const identity = identityOf(me)
      this.setData({
        title: labels.module[key],
        back: !top,
        roles: identity.lead,
        person: identity.person,
        tabs: top ? tabsOf(me) : [],
        failure: null,
      })
    },
    onFailureAction(event: DetailEvent<string>) {
      if (event.detail === 'logout') void logout()
      else void this.load()
    },
  },
})
