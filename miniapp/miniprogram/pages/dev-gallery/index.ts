// 组件总览（02 章第 4 节、第 9 节）：每个 hz-* 组件的各种状态摆在一页，和 docs/design/gallery.html 对照。
// 只在开发环境出现，正式版不打包
import { copy, redesignCopy, formatMoney, labels, shanghaiDateOf } from '@huazhong/shared'
import type { DetailEvent, IndexEvent } from '../../core/events'
import { emptyFilter, type FilterValue } from '../../core/filter'
import { confirmLeave, isChanged, syncUnloadAlert } from '../../core/guard'
import { iconNames } from '../../core/icon-names'
import { showSuccess } from '../../core/toast'
import { samples } from './samples'

const CENTS_PER_YUAN = 100
const DEMO_SUBMIT_MS = 2000
type Line = (typeof samples.editLines)[number]

function amountOf(line: Line): Line {
  return { ...line, amountCents: line.qty * line.priceCents }
}

Page({
  data: {
    ...samples,
    stockCards: samples.stockCards.map((row) => ({
      ...row,
      fields: [
        { label: copy.title.inventory, value: row.total },
        { label: copy.field.code, value: row.meta },
      ],
    })),
    cards: samples.cards.map((row) => ({
      ...row,
      fields: [
        { label: redesignCopy.no, value: row.meta, wide: true },
        { label: redesignCopy.orderDate, value: row.date },
        {
          label: row.status === 'shipped' ? redesignCopy.shippedAmount : redesignCopy.orderAmount,
          value: formatMoney(row.amount),
          amount: true,
        },
      ],
    })),
    title: copy.title.devGallery,
    modules: Object.values(labels.module),
    today: shanghaiDateOf(Date.now()),
    icons: [...iconNames],
    cover: '',
    filterA: emptyFilter,
    filterB: emptyFilter,
    filterC: emptyFilter,
    lines: samples.editLines.map(amountOf),
    submitting: false,
    note: '',
    store: '',
    shipDate: '',
    sheet: false,
    error: '',
    files: samples.uploadFiles,
  },
  onCover(event: IndexEvent) {
    const mode = samples.coverModes[event.currentTarget.dataset.index]
    this.setData({ cover: mode?.key ?? '' })
  },
  onFilter(event: DetailEvent<FilterValue, { name: string }>) {
    this.setData({ [event.currentTarget.dataset.name]: event.detail })
  },
  onQty(event: DetailEvent<{ index: number; qty: number }>) {
    const { index, qty } = event.detail
    this.setData({
      lines: this.data.lines.map((line, i) => (i === index ? amountOf({ ...line, qty }) : line)),
    })
  },
  onPrice(event: DetailEvent<{ index: number; text: string }>) {
    const { index, text } = event.detail
    const priceCents = Math.round((Number(text) || 0) * CENTS_PER_YUAN)
    const lines = this.data.lines.map((line, i) =>
      i === index ? amountOf({ ...line, priceText: text, priceCents }) : line,
    )
    this.setData({ lines })
  },
  onRemoveLine(event: DetailEvent<number>) {
    this.setData({ lines: this.data.lines.filter((_, i) => i !== event.detail) })
  },
  onAddLine() {
    this.setData({ lines: [...this.data.lines, samples.extraLine] })
  },
  onSubmit() {
    this.setData({ submitting: true })
    setTimeout(() => {
      this.setData({ submitting: false })
      showSuccess(samples.texts.confirmed)
    }, DEMO_SUBMIT_MS)
  },
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail })
    syncUnloadAlert(isChanged('', event.detail))
  },
  onStore(event: DetailEvent<string>) {
    this.setData({ store: event.detail })
  },
  onShipDate(event: DetailEvent<string>) {
    this.setData({ shipDate: event.detail })
  },
  onOpenSheet() {
    this.setData({ sheet: true })
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  onAsk() {
    void confirmLeave(this, true).then((discard) => {
      if (discard) showSuccess(copy.confirm.discard)
    })
  },
  onToggleError() {
    this.setData({ error: this.data.error ? '' : samples.texts.businessError })
  },
  onLongToast() {
    showSuccess(samples.texts.longToast)
  },
  onAddFiles(event: DetailEvent<{ url: string }[]>) {
    this.setData({ files: [...this.data.files, ...event.detail] })
  },
  onRemoveFile(event: DetailEvent<number>) {
    this.setData({ files: this.data.files.filter((_, i) => i !== event.detail) })
  },
})
