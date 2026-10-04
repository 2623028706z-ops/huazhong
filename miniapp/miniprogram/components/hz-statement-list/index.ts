// 对账单里的单据清单（发货单 / 采购单、售后 / 退货、收款记录共用）：
// 一张卡，抬头（标题 + 右边张数），按门店分组（组头写「滨江店 1 张 小计 ¥…」），
// 每行：单号 + 金额，下面小字写日期等字段；没有内容时写 emptyText。
// selectable 的行左边有勾选框（上期未对账的单据）；点行发 press，点勾选框发 toggle，detail 都是行的 key
interface Row {
  key: string
  title: string
  amountLabel: string
  amount: string
  notes: string[]
  tags?: { text: string; warn: boolean; done?: boolean }[]
  selectable?: boolean
  selected?: boolean
  muted?: boolean
}
interface Group {
  key: string
  head: string
  meta: string
  rows: Row[]
}
type KeyEvent = WechatMiniprogram.TouchEvent<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  { key: string }
>

Component({
  properties: {
    title: { type: String, value: '' },
    meta: { type: String, value: '' },
    groups: { type: Array, value: [] as Group[] },
    emptyText: { type: String, value: '' },
  },
  methods: {
    onPress(event: KeyEvent) {
      this.triggerEvent('press', event.currentTarget.dataset.key)
    },
    onToggle(event: KeyEvent) {
      this.triggerEvent('toggle', event.currentTarget.dataset.key)
    },
  },
})
