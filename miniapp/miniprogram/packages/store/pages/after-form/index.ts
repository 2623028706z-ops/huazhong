// S8 申请售后（06 章 S8）：原订单、出货日期 → 明细（数量上限 maxQty；问题原因、问题说明、图片）→「添加产品」。
// 提交后进 S7，并打开这张售后的详情弹层
import { contract, copy, type OrderDetail } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { uploadImage, type LocalImage } from '../../../../core/upload'
import { rowsOf, shipDateText } from '../../../../views/order'
import { reasonOptions } from '../../../../views/after'
import { checkForm, formLineOf, lineErrorsOf, type FormLine, type LineErrors } from './form'

type IndexDetail<T> = DetailEvent<T, { index: number }>

Page({
  data: {
    title: copy.screen.title.applyAfter,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    info: [] as { label: string; value: string }[],
    lines: [] as FormLine[],
    lineErrors: [] as LineErrors[],
    reasonOptions,
    pickSheet: false,
    picks: [] as { id: string; name: string; sub: string }[],
    saving: false,
    uploading: false,
    texts: {
      reason: copy.screen.label.afterReason,
      description: copy.screen.label.afterDescription,
      images: copy.screen.label.afterImages,
      add: copy.screen.action.addProduct,
      submit: copy.screen.action.submitAfter,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
    },
  },
  orderId: '',
  order: null as OrderDetail | null,
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    this.orderId = query.orderId ?? ''
    this.idempotencyKey = newIdempotencyKey()
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load() {
    const result = await request(contract.getOrder, { params: { id: this.orderId } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    const order = result.data
    this.order = order
    this.setData({
      loaded: true,
      failure: null,
      info: rowsOf([
        [copy.screen.label.sourceOrder, order.no],
        [copy.field.shipDate, shipDateText(order.shipDate)],
      ]),
    })
  },
  setLines(lines: FormLine[]) {
    this.setData({ lines, lineErrors: lineErrorsOf({}, lines.length), formError: '' })
    syncUnloadAlert(lines.length > 0)
  },
  update(index: number, patch: Partial<FormLine>) {
    this.setLines(this.data.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  },
  onQty(event: IndexDetail<number>) {
    this.update(event.currentTarget.dataset.index, { qty: event.detail })
  },
  onReason(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { reason: event.detail })
  },
  onDescription(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { description: event.detail })
  },
  onRemoveLine(event: DetailEvent<unknown, { index: number }>) {
    const { index } = event.currentTarget.dataset
    this.setLines(this.data.lines.filter((_, i) => i !== index))
  },
  async onAddImages(event: IndexDetail<LocalImage[]>): Promise<void> {
    const { index } = event.currentTarget.dataset
    this.setData({ uploading: true, formError: '' })
    for (const file of event.detail) {
      const result = await uploadImage('after_image', file)
      if (!result.ok) {
        this.setData({ formError: result.message })
        break
      }
      const line = this.data.lines[index]
      if (line) this.update(index, { images: [...line.images, result.image] })
    }
    this.setData({ uploading: false })
  },
  onRemoveImage(event: IndexDetail<number>) {
    const { index } = event.currentTarget.dataset
    const line = this.data.lines[index]
    if (line) this.update(index, { images: line.images.filter((_, i) => i !== event.detail) })
  },
  // 只列这张单里还能申请、还没加进来的产品
  onOpenPick() {
    const added = new Set(this.data.lines.map((line) => line.orderLineId))
    const picks = (this.order?.lines ?? [])
      .filter((line) => (line.maxQty ?? 0) > 0 && !added.has(line.id))
      .map((line) => ({ id: line.id, name: line.name, sub: copy.screen.maxQty(line.maxQty ?? 0) }))
    this.setData({ pickSheet: true, picks })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  onPick(event: KeyEvent) {
    const line = this.order?.lines.find((l) => l.id === event.currentTarget.dataset.key)
    this.setData({ pickSheet: false })
    if (line) this.setLines([...this.data.lines, formLineOf(line)])
  },
  showFields(fields: Record<string, string>, message: string) {
    this.setData({ lineErrors: lineErrorsOf(fields, this.data.lines.length), formError: message })
  },
  async onSubmit(): Promise<void> {
    const checked = checkForm(this.orderId, this.data.lines)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    const result = await request(contract.createStoreAfter, { body: checked.body }, options)
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      void wx.redirectTo({ url: `/packages/store/pages/afters/index?open=${result.data.id}` })
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields, view.message)
    else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
