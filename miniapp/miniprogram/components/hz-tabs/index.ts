import type { KeyEvent } from '../../core/events'

Component({
  properties: {
    items: { type: Array, value: [] as { key: string; text: string }[] },
    value: { type: String, value: '' },
    // 页面最上面分几段（门店「订单 / 售后 / 对账」、收付款记录「收款 / 付款」）：定稿 .seg 宋体大字 + 红色短线
    big: { type: Boolean, value: false },
    // 页签右边的数字角标（{ 页签 key: 数量 }），红底白字小圆，0 或没传不显示；和 hz-filter-bar 同一种样子
    counts: { type: Object, value: {} },
  },
  methods: {
    onPick(event: KeyEvent) {
      this.triggerEvent('change', event.currentTarget.dataset.key)
    },
  },
})
