// 下拉、日期（02 章第 4 节）：同 hz-field 外观；点开是微信原生 picker（2026-10-02 确认）。
// mode 为 selector 时 value 是选项 id；为 date 时 value 是 YYYY-MM-DD，start / end 限定可选范围
import { copy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'

interface Option {
  id: string
  name: string
}

// 标成 string：copy 是 as const，直接放进 data 会被推成字面量类型
const DEFAULT_HINT: string = copy.placeholder.choose

Component({
  properties: {
    label: { type: String, value: '' },
    mode: { type: String, value: 'selector' },
    options: { type: Array, value: [] as Option[] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    error: { type: String, value: '' },
    start: { type: String, value: '' },
    end: { type: String, value: '' },
  },
  data: { index: -1, shown: '', hint: DEFAULT_HINT },
  observers: {
    'options, value, mode, placeholder'(
      options: Option[],
      value: string,
      mode: string,
      placeholder: string,
    ) {
      const index = options.findIndex((option) => option.id === value)
      const shown = mode === 'date' ? value : (options[index]?.name ?? '')
      this.setData({ index, shown, hint: placeholder || DEFAULT_HINT })
    },
  },
  methods: {
    onPick(event: DetailEvent<{ value: string }>) {
      const picked = event.detail.value
      if (this.data.mode === 'date') {
        this.triggerEvent('change', picked)
        return
      }
      const option = this.data.options[Number(picked)]
      if (option) this.triggerEvent('change', option.id)
    },
  },
})
