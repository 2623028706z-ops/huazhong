// S8 申请售后（06 章 S8）：原订单、出货日期 → 明细（数量上限 maxQty；问题原因、问题说明、图片）→「添加产品」。
// 提交后进 S7，并打开这张售后的详情弹层
import { contract, copy, financeCopy, labels, type OrderDetail } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { syncUnloadAlert, isChanged } from '../../../../core/guard'
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
    editIndex: -1,
    editorNew: false,
    editChanged: false,
    editInitial: null as FormLine | null,
    editLine: null as FormLine | null,
    editError: { qty: '', reason: '', description: '', images: '' },
    tableRows: [] as (FormLine & { reasonText: string; imageCount: number })[],
    texts: {
      lines: copy.screen.section.afterLines,
      code: copy.screen.label.customerCode,
      reason: copy.screen.label.afterReason,
      description: copy.screen.label.afterDescription,
      images: financeCopy.imagesRequired,
      add: copy.screen.action.addProduct,
      submit: copy.screen.action.submitAfter,
      qty: financeCopy.afterQty,
      remove: copy.screen.action.delete,
      confirm: financeCopy.confirm,
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
    this.setData({
      lines,
      tableRows: lines.map((line) => ({
        ...line,
        reasonText: line.reason
          ? labels.afterReason[line.reason as keyof typeof labels.afterReason]
          : '',
        imageCount: line.images.length,
      })),
      lineErrors: lineErrorsOf({}, lines.length),
      formError: '',
    })
    syncUnloadAlert(lines.length > 0)
  },
  update(index: number, patch: Partial<FormLine>) {
    if (this.data.editIndex === index && this.data.editLine) {
      this.setData({
        editLine: { ...this.data.editLine, ...patch },
        editChanged: isChanged(this.data.editInitial, { ...this.data.editLine, ...patch }),
        editError: { qty: '', reason: '', description: '', images: '' },
      })
      return
    }
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
        this.setData({ editError: { ...this.data.editError, images: result.message } })
        break
      }
      const line = this.data.editIndex === index ? this.data.editLine : this.data.lines[index]
      if (line) this.update(index, { images: [...line.images, result.image] })
    }
    this.setData({ uploading: false })
  },
  onRemoveImage(event: IndexDetail<number>) {
    const { index } = event.currentTarget.dataset
    const line = this.data.editIndex === index ? this.data.editLine : this.data.lines[index]
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
    if (line) {
      const lines = [...this.data.lines, formLineOf(line)]
      this.setLines(lines)
      this.openEditor(lines.length - 1)
      this.setData({ editorNew: true })
    }
  },
  onEditLine(event: DetailEvent<unknown, { index: number }>) {
    this.openEditor(event.currentTarget.dataset.index)
  },
  openEditor(index: number) {
    const line = this.data.lines[index]
    if (line)
      this.setData({
        editIndex: index,
        editorNew: false,
        editChanged: false,
        editInitial: { ...line, images: [...line.images] },
        editLine: { ...line, images: [...line.images] },
        editError: this.data.lineErrors[index] ?? {
          qty: '',
          reason: '',
          description: '',
          images: '',
        },
      })
  },
  onCloseEditor() {
    if (this.data.uploading) return
    if (this.data.editorNew)
      this.setLines(this.data.lines.filter((_, i) => i !== this.data.editIndex))
    this.setData({ editIndex: -1, editLine: null, editorNew: false, editChanged: false })
  },
  onConfirmEditor() {
    const edited = this.data.editLine
    if (!edited) return
    const checked = checkForm(this.orderId, [edited])
    if (!checked.ok) {
      this.setData({
        editError: lineErrorsOf(checked.fields, 1)[0] ?? {
          qty: '',
          reason: '',
          description: '',
          images: '',
        },
      })
      return
    }
    this.setLines(this.data.lines.map((line, i) => (i === this.data.editIndex ? edited : line)))
    this.setData({ editorNew: false })
    this.onCloseEditor()
  },
  onDeleteEditor() {
    this.setLines(this.data.lines.filter((_, i) => i !== this.data.editIndex))
    this.setData({ editorNew: false })
    this.onCloseEditor()
  },
  showFields(fields: Record<string, string>) {
    this.setData({
      lineErrors: lineErrorsOf(fields, this.data.lines.length),
      formError: unplacedErrorOf(fields, [
        'lines.*.qty',
        'lines.*.reason',
        'lines.*.description',
        'lines.*.imageFileIds',
      ]),
    })
    const index = this.data.lineErrors.findIndex((row) => Object.values(row).some(Boolean))
    if (index >= 0) this.openEditor(index)
  },
  async onSubmit(): Promise<void> {
    const checked = checkForm(this.orderId, this.data.lines)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    const result = await request(contract.createStoreAfter, { body: checked.body }, options)
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      void wx.redirectTo({ url: `/packages/store/pages/after-detail/index?id=${result.data.id}` })
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields)
    else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
