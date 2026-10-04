import type { KeyEvent } from '../../core/events'

Component({
  properties: {
    items: { type: Array, value: [] as { key: string; text: string }[] },
    value: { type: String, value: '' },
    // 页面最上面分几段（门店「订单 / 售后 / 对账」、收付款记录「收款 / 付款」）：定稿 .seg 宋体大字 + 红色短线
    big: { type: Boolean, value: false },
  },
  methods: {
    onPick(event: KeyEvent) {
      this.triggerEvent('change', event.currentTarget.dataset.key)
    },
  },
})
