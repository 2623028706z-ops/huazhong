// 顶栏（02 章第 4 节）：高 44px，右侧按胶囊位置留白；只放返回和居中衬线标题。
// 一级页面不传 back；花众首页、模块首页传 person，下面一行放身份（左）和日期（右）。
// 断网时顶栏下出一条提示（02 章第 5.2 节）。guard 为 true 时点返回先问「放弃修改吗？」
import { copy, shanghaiDateOf } from '@huazhong/shared'
import { confirmLeave } from '../../core/guard'
import { navLayout } from '../../core/layout'
import { subscribeNetwork } from '../../core/network'

const unsubscribers = new WeakMap<object, () => void>()

Component({
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    guard: { type: Boolean, value: false },
    // 身份行：岗位（多个用「、」连）+ 姓名
    roles: { type: String, value: '' },
    person: { type: String, value: '' },
    // 铺品牌背景的页面顶栏透明
    transparent: { type: Boolean, value: false },
  },
  data: { statusBar: 0, capsuleGap: 0, today: '', offline: false, offlineText: copy.state.offline },
  lifetimes: {
    attached() {
      const { statusBar, capsuleGap } = navLayout()
      this.setData({ statusBar, capsuleGap, today: shanghaiDateOf(Date.now()) })
      const unsubscribe = subscribeNetwork((online) => {
        this.setData({ offline: !online })
      })
      unsubscribers.set(this, unsubscribe)
    },
    detached() {
      unsubscribers.get(this)?.()
    },
  },
  methods: {
    onBack() {
      void confirmLeave(this.selectOwnerComponent(), this.data.guard).then((canLeave) => {
        if (canLeave) void wx.navigateBack()
      })
    },
  },
})
