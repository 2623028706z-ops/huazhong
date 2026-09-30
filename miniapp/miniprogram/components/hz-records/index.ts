// 记录列表（02 章第 4 节）：订单变更、采购单改单、改价、退货记录都用这一个组件。
// 每条左边时间和操作人，右边改了什么（一行一项）和原因（没有不显示）；标题按 type 取
import { copy } from '@huazhong/shared'

type RecordType = 'orderChange' | 'poChange' | 'priceChange' | 'returns'

interface RecordItem {
  id: string
  // ISO 时间戳
  at: string
  actor: string
  changes: string[]
  reason: string | null
}

Component({
  properties: {
    type: { type: String, value: 'orderChange' },
    items: { type: Array, value: [] as RecordItem[] },
  },
  data: { title: '', rows: [] as (RecordItem & { reasonText: string })[] },
  observers: {
    'type, items'(type: RecordType, items: RecordItem[]) {
      const rows = items.map((item) => ({
        ...item,
        reasonText: item.reason ? copy.records.reason(item.reason) : '',
      }))
      this.setData({ title: copy.records[type], rows })
    },
  },
})
