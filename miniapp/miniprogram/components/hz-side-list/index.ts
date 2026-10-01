// 左侧列表（06 章 S1 分类、X8 / X11 客户）：选中亮格底 + 墨色加粗 + 左侧陶土短线；
// 项可带一行小字（停用的客户「已停用」）。点了发 change，detail 是项的 id
import type { KeyEvent } from '../../core/events'

interface Item {
  id: string
  name: string
  sub: string
}

Component({
  properties: {
    items: { type: Array, value: [] as Item[] },
    value: { type: String, value: '' },
  },
  methods: {
    onTap(event: KeyEvent) {
      const { key } = event.currentTarget.dataset
      if (key !== this.data.value) this.triggerEvent('change', key)
    },
  },
})
