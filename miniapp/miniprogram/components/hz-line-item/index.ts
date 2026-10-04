import { copy, redesignCopy, formatMoney, formatUnitTotals } from '@huazhong/shared'
import { centsOfText, sumCents, textOfCents } from '../../core/money'
import type { DetailEvent, IndexEvent } from '../../core/events'

interface Line {
  key: string
  name: string
  code?: string
  tags: { text: string; warn: boolean }[]
  amountCents?: number
  qty: number
  orderedQty?: number
  purchaseQty?: number
  unit: string
  priceCents?: number
  priceText?: string
  removable?: boolean
  readonly?: boolean
  max?: number
  packed?: boolean
}

Component({
  properties: {
    lines: { type: Array, value: [] as Line[] },
    mode: { type: String, value: 'view' },
    editKey: { type: String, value: '' },
    removable: { type: Boolean, value: false },
    min: { type: Number, value: 0 },
    qtyLabel: { type: String, value: '' },
    note: { type: String, value: '' },
    noteLabel: { type: String, value: '' },
    quantityOnly: { type: Boolean, value: false },
    quantityReadonly: { type: Boolean, value: false },
    title: { type: String, value: '' },
    picking: { type: Boolean, value: false },
    // 有值就在合计上面放一行「+ 添加产品」，点了发 add
    addText: { type: String, value: '' },
  },
  data: {
    showEditor: false,
    activeIndex: -1,
    draftQty: 0,
    draftPrice: '',
    draftAmount: '',
    totalQty: '',
    totalAmount: '',
    packedText: '',
    packedCount: 0,
    activeLine: null as Line | null,
    lastEditKey: '',
    priceError: '',
    maxQty: Number.MAX_SAFE_INTEGER,
    texts: {
      lines: redesignCopy.productLines,
      qty: redesignCopy.qty,
      actual: redesignCopy.actual,
      purchaseQty: redesignCopy.purchaseQty,
      unit: redesignCopy.unit,
      price: redesignCopy.price,
      subtotal: redesignCopy.subtotal,
      code: redesignCopy.code,
      totalQty: redesignCopy.totalQty,
      totalAmount: redesignCopy.totalAmount,
      remove: copy.screen.action.delete,
      confirm: redesignCopy.confirm,
      yuan: copy.unit.yuan,
    },
  },
  observers: {
    'editKey,lines'(key: string, lines: Line[]) {
      if (!key) {
        this.setData({ lastEditKey: '' })
        return
      }
      if (key === this.data.lastEditKey) return
      const index = lines.findIndex((line) => line.key === key)
      if (index >= 0) {
        this.setData({ lastEditKey: key })
        this.edit(index)
      }
    },
    lines(lines: Line[]) {
      const totals = new Map<string, number>()
      for (const line of lines) totals.set(line.unit, (totals.get(line.unit) ?? 0) + line.qty)
      this.setData({
        totalQty: formatUnitTotals([...totals].map(([unit, qty]) => ({ unit, qty }))),
        totalAmount: formatMoney(sumCents(lines, (line) => line.amountCents ?? 0)),
        packedCount: lines.filter((line) => line.packed).length,
        packedText: redesignCopy.packed(lines.filter((line) => line.packed).length, lines.length),
      })
    },
  },
  methods: {
    edit(index: number) {
      const line = this.data.lines[index]
      if (!line || line.readonly || this.data.mode === 'view' || this.data.mode === 'after') return
      if (this.data.mode === 'custom') {
        this.triggerEvent('edit', index)
        return
      }
      const price = line.priceText ?? textOfCents(line.priceCents ?? 0)
      this.setData({
        showEditor: true,
        activeIndex: index,
        activeLine: line,
        draftQty: line.qty,
        draftPrice: price,
        priceError: '',
        draftAmount: formatMoney(line.qty * (centsOfText(price) ?? 0)),
      })
    },
    onEdit(event: IndexEvent) {
      this.edit(event.currentTarget.dataset.index)
    },
    onAdd() {
      this.triggerEvent('add')
    },
    onClose() {
      this.setData({ showEditor: false })
    },
    onDraftQty(event: DetailEvent<number>) {
      this.setData({
        draftQty: event.detail,
        draftAmount: formatMoney(event.detail * (centsOfText(this.data.draftPrice) ?? 0)),
      })
    },
    onDraftPrice(event: DetailEvent<string>) {
      this.setData({
        draftPrice: event.detail,
        priceError: '',
        draftAmount: formatMoney(this.data.draftQty * (centsOfText(event.detail) ?? 0)),
      })
    },
    onConfirm() {
      const { activeIndex, draftQty, draftPrice, mode, quantityOnly } = this.data
      if (mode === 'price' && !quantityOnly && centsOfText(draftPrice) === null) {
        this.setData({ priceError: copy.error.validationFallback })
        return
      }
      this.triggerEvent('qty', { index: activeIndex, qty: draftQty })
      if (mode === 'price' && !quantityOnly)
        this.triggerEvent('price', { index: activeIndex, text: draftPrice })
      this.setData({ showEditor: false })
    },
    onRemoveRead(event: IndexEvent) {
      const index = event.currentTarget.dataset.index
      if (this.data.removable && this.data.lines[index]?.removable)
        this.triggerEvent('remove', index)
    },
    onRemove() {
      this.triggerEvent('remove', this.data.activeIndex)
      this.setData({ showEditor: false })
    },
    onPacked(event: IndexEvent) {
      this.triggerEvent('packed', event.currentTarget.dataset.index)
    },
    onPreview(event: DetailEvent<unknown, { url: string; urls: string[] }>) {
      void wx.previewImage({
        current: event.currentTarget.dataset.url,
        urls: event.currentTarget.dataset.urls,
      })
    },
  },
})
