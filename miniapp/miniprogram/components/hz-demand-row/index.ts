import { redesignCopy } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
Component({
  properties: {
    selected: { type: Boolean, value: false },
    enabled: { type: Boolean, value: true },
    name: { type: String, value: '' },
    range: { type: String, value: '' },
    need: { type: Number, value: 0 },
    stock: { type: Number, value: 0 },
    transit: { type: Number, value: 0 },
    summary: { type: String, value: '' },
    left: { type: String, value: '' },
    short: { type: Boolean, value: false },
    tags: { type: Array, value: [] },
  },
  data: {
    texts: {
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
