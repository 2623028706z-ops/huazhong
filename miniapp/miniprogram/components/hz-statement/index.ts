// 总账格（02 章第 4 节）：一行等分的几格（标签在上、金额在下，居中，宋体加粗）；
// due 的格（未收 / 待付 / 应收）用品牌红字，金额由后端算好（分），text 有值就直接显示（例如「−¥0.00」）。
// rows 是格子下面的行（多收、账期），点行右边的文字发 action（detail 是行的 key）
interface Cell {
  label: string
  amountCents: number
  due: boolean
  text?: string
}
interface TextRow {
  key: string
  label: string
  text: string
  amount?: boolean
  action?: string
}

Component({
  properties: {
    cells: { type: Array, value: [] as Cell[] },
    rows: { type: Array, value: [] as TextRow[] },
  },
  methods: {
    onAction(
      event: WechatMiniprogram.TouchEvent<
        WechatMiniprogram.IAnyObject,
        WechatMiniprogram.IAnyObject,
        { key: string }
      >,
    ) {
      this.triggerEvent('action', event.currentTarget.dataset.key)
    },
  },
})
