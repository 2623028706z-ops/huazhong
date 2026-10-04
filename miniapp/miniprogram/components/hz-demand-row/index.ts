import { redesignCopy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
Component({
  properties: {
    selected: { type: Boolean, value: false },
    enabled: { type: Boolean, value: true },
    name: { type: String, value: '' },
    // 出货日期：一天写一个日期，多天写「起 ~ 止」
    range: { type: String, value: '' },
    need: { type: String, value: '' },
    stock: { type: String, value: '' },
    transit: { type: String, value: '' },
    left: { type: String, value: '' },
    short: { type: Boolean, value: false },
    tags: { type: Array, value: [] },
  },
  data: {
    texts: {
      shipDate: redesignCopy.shipDate,
      need: redesignCopy.need,
      stock: redesignCopy.inStock,
      transit: redesignCopy.inTransit,
    },
  },
  methods: {
    onToggle() {
      if (this.data.enabled) this.triggerEvent('toggle')
    },
    onOpen(_event: DetailEvent<unknown>) {
      this.triggerEvent('open')
    },
  },
})
