// 往来对账汇总（客户 / 供应商详情）：只突出一个红色大字金额（客户未收 / 供应商未付），
// 其余（未结清、未对账、多收、账期、期初欠款）收成一两行灰色小字；「修改」是卡片右上角文字。
// lines 里的行可带 action（例如多收后面的「退款」），点了发 action（detail 是行的 key）
interface Line {
  key: string
  text: string
  action?: string
}

Component({
  properties: {
    label: { type: String, value: '' },
    amountCents: { type: Number, value: 0 },
    lines: { type: Array, value: [] as Line[] },
    // 右上角文字入口（不传就不显示），点了发 action，detail 是 editKey
    edit: { type: String, value: '' },
    editKey: { type: String, value: 'terms' },
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
