// 表单字段（02 章第 4 节，表单对齐 A）：页面卡片里字段名靠左、值靠右、不带框（数字、多行备注同样）；
// 弹层里（u-boxed）整条带框靠左、聚焦陶土红描边。出错下面写原因，重新输入后由页面清掉 error
import type { DetailEvent } from '../../core/events'

Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    // text | number | digit | textarea
    type: { type: String, value: 'text' },
    error: { type: String, value: '' },
    suffix: { type: String, value: '' },
    // 主信息（目录产品的订货价）：数字用宋体大字，框也高一些
    big: { type: Boolean, value: false },
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
