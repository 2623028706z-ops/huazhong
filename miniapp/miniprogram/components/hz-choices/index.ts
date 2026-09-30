// 多选胶囊（员工弹层的模块）：标签在上，选项一行排开，选中陶土红描边 + 墨色加粗；
// 出错同 hz-field，下面写原因。改了发 change，detail 是选中 id 的数组（按 options 的顺序）
import type { KeyEvent } from '../../core/events'

interface Option {
  id: string
  name: string
}

Component({
  properties: {
    label: { type: String, value: '' },
    options: { type: Array, value: [] as Option[] },
    value: { type: Array, value: [] as string[] },
    error: { type: String, value: '' },
  },
  data: { items: [] as (Option & { on: boolean })[] },
  observers: {
    'options, value'(options: Option[], value: string[]) {
      this.setData({
        items: options.map((option) => ({ ...option, on: value.includes(option.id) })),
      })
    },
  },
  methods: {
    onTap(event: KeyEvent) {
      const { key } = event.currentTarget.dataset
      const value: string[] = this.data.value
      const next = value.includes(key) ? value.filter((id) => id !== key) : [...value, key]
      const options: Option[] = this.data.options
      this.triggerEvent(
        'change',
        options.filter((option) => next.includes(option.id)).map((option) => option.id),
      )
    },
  },
})
