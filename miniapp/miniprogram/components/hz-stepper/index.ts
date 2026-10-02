// 步进器（02 章第 4 节）：圆形 30px，减号细线、加号陶土红实心；可点范围 44px；
// 点数字可以直接输入（数字键盘）。上下限由页面按业务规则传
import type { DetailEvent } from '../../core/events'

Component({
  properties: {
    value: { type: Number, value: 0 },
    min: { type: Number, value: 0 },
    max: { type: Number, value: Number.MAX_SAFE_INTEGER },
    error: { type: Boolean, value: false },
  },
  methods: {
    onChange(event: DetailEvent<{ value: number | string }>) {
      this.triggerEvent('change', Number(event.detail.value))
    },
  },
})
