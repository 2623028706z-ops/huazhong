// 表单字段（02 章第 4 节）：标签在上；输入框 42px、亮格底、细线；聚焦陶土红描边；
// 出错玫瑰红描边 + 浅底，下面写原因；type 为 textarea 时多行 72px。重新输入后由页面清掉 error
import type { DetailEvent } from '../../core/events'

Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    // text | number | digit | textarea
    type: { type: String, value: 'text' },
    error: { type: String, value: '' },
  },
  data: { focused: false },
  methods: {
    onFocus() {
      this.setData({ focused: true })
    },
    onBlur() {
      this.setData({ focused: false })
    },
    onChange(event: DetailEvent<{ value: string }>) {
      this.triggerEvent('change', event.detail.value)
    },
  },
})
