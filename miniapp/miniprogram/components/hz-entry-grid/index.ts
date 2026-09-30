// 入口卡（02 章第 4 节）：两列；图标左上、名称左下、箭头右下；单数时最后一张占整行；
// disabled 的整张变淡、不能点。点了发 select，detail 是入口的 key
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
  },
  methods: {
    onTap(event: IndexEvent) {
      const entry = this.data.entries[event.currentTarget.dataset.index]
      if (!entry || entry.disabled) return
      this.triggerEvent('select', entry.key)
    },
  },
})
