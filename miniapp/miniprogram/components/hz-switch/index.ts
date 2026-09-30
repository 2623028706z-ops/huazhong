// 开关（员工弹层的「管理员」「启用」）：左边标签，右边 TDesign 开关（颜色取 --td-brand-color）。改了发 change，detail 是布尔
import type { DetailEvent } from '../../core/events'

Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: Boolean, value: false },
  },
  methods: {
    onChange(event: DetailEvent<{ value: boolean }>) {
      this.triggerEvent('change', event.detail.value)
    },
  },
})
