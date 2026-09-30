// 明细行（02 章第 4 节，方案甲）：
// view 只读，全部明细一张卡片；qty 只改数量（门店订货，单价写成文字）；price 数量和单价都能改。
// 表单一行一张卡片。行金额由页面用 shared 的函数算好传进来（00 章第 1 节），这里只显示
import { copy } from '@huazhong/shared'
import type { DetailEvent, IndexEvent } from '../../core/events'

interface Line {
  key: string
  name: string
  // 改价、少发、已停订：接在名称后面
  tags: { text: string; warn: boolean }[]
  amountCents: number
  qty: number
  unit: string
  priceCents: number
  // 单价输入框里的文字（元），由页面保存，避免输入时被格式化打断
  priceText: string
}

Component({
  properties: {
    lines: { type: Array, value: [] as Line[] },
    mode: { type: String, value: 'view' },
    // actions 里有 removeLine 时才显示垃圾桶
    removable: { type: Boolean, value: false },
    min: { type: Number, value: 0 },
  },
  data: { yuan: copy.unit.yuan },
  methods: {
    onQty(event: DetailEvent<number, { index: number }>) {
      this.triggerEvent('qty', { index: event.currentTarget.dataset.index, qty: event.detail })
    },
    onPrice(event: DetailEvent<{ value: string }, { index: number }>) {
      this.triggerEvent('price', {
        index: event.currentTarget.dataset.index,
        text: event.detail.value,
      })
    },
    onRemove(event: IndexEvent) {
      this.triggerEvent('remove', event.currentTarget.dataset.index)
    },
  },
})
