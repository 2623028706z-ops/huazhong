// 入口窗格（02 章第 4 节）：一整块细线窗格，两列；图标左上、名称左下、箭头右下；单数时最后一格占整行；
// compact 是模块首页的小一号；disabled 的格变淡、不能点。点了发 select，detail 是入口的 key
import type { IndexEvent } from '../../core/events'

interface Entry {
  key: string
  icon: string
  text: string
  disabled: boolean
}

Component({
  properties: {
    entries: { type: Array, value: [] as Entry[] },
    compact: { type: Boolean, value: false },
  },
  methods: {
    onTap(event: IndexEvent) {
      const entry = this.data.entries[event.currentTarget.dataset.index]
      if (!entry || entry.disabled) return
      this.triggerEvent('select', entry.key)
    },
  },
})
