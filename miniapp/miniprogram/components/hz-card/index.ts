// 标签和值组成的双列列表卡，所有显示字段由页面 view 提供。
interface Field {
  label: string
  value: string
  amount?: boolean
  phone?: string
  wide?: boolean
}
interface CardRow {
  title: string
  status?: string
  headText?: string
  fields: Field[]
  tags?: { text: string; warn: boolean }[]
}
const emptyCard: CardRow = { title: '', fields: [] }
Component({
  properties: {
    selectable: { type: Boolean, value: false },
    selected: { type: Boolean, value: false },
    selectDisabled: { type: Boolean, value: false },
    row: { type: Object, value: emptyCard },
    statusKind: { type: String, value: '' },
  },
  methods: {
    onPhone(
      event: WechatMiniprogram.TouchEvent<
        WechatMiniprogram.IAnyObject,
        WechatMiniprogram.IAnyObject,
        { phone: string }
      >,
    ) {
      if (event.currentTarget.dataset.phone)
        void wx.makePhoneCall({ phoneNumber: event.currentTarget.dataset.phone })
    },
    onTap() {
      this.triggerEvent('press')
    },
    onToggle() {
      if (!this.data.selectDisabled) this.triggerEvent('toggle')
    },
  },
})
