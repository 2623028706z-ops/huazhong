// 底栏（02 章第 4 节、01 章第 3.1 节）：不用微信 tabBar 配置，每个标签页放一个；切换用 wx.reLaunch。
// 标签按角色由页面传进来；badge 为 0 不显示角标，超过 99 写 99+
import type { IndexEvent } from '../../core/events'

interface Tab {
  key: string
  icon: string
  text: string
  url: string
  badge: number
}

Component({
  properties: {
    tabs: { type: Array, value: [] as Tab[] },
    current: { type: String, value: '' },
  },
  methods: {
    onTap(event: IndexEvent) {
      const tab = this.data.tabs[event.currentTarget.dataset.index]
      if (!tab || tab.key === this.data.current) return
      void wx.reLaunch({ url: tab.url })
    },
  },
})
