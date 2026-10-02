// X7 售后表单（06 章 X7）：处理（processAfter，从 X6）、新建（从 X3、X5）。
// 原订单、客户门店 → 明细（数量上限 maxQty；单价默认发货单价）→ 售后金额合计 → 处理说明（选填）
import { contract, copy, type AfterDetail, type OrderDetail } from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { markChanged, syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { previewImage, reasonOptions } from '../../../../views/after'
import { rowsOf } from '../../../../views/order'
import {
  amountTextsOf,
  checkCreate,
  checkProcess,
  createLineOf,
  lineErrorsOf,
  processLinesOf,
  totalRowsOf,
  type FormLine,
  type LineErrors,
} from './form'

type IndexDetail<T> = DetailEvent<T, { index: number }>

Page({
  data: {
    changed: false,
    isProcess: false,
    title: '',
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    info: [] as { label: string; value: string }[],
    lines: [] as FormLine[],
    amountTexts: [] as string[],
    totalRows: [] as ReturnType<typeof totalRowsOf>,
    lineErrors: [] as LineErrors[],
    note: '',
    reasonOptions,
    pickSheet: false,
    picks: [] as { id: string; name: string; sub: string }[],
    saving: false,
    texts: {
      lines: copy.screen.section.afterLines,
      price: copy.screen.label.price,
      reason: copy.screen.label.afterReason,
      description: copy.screen.label.afterDescription,
      note: copy.screen.label.processNote,
      optional: copy.placeholder.optional,
      add: copy.screen.action.addProduct,
      save: copy.action.saveAfter,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
    },
  },
  id: '',
  orderId: '',
  after: null as AfterDetail | null,
  order: null as OrderDetail | null,
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const isProcess = query.mode === 'process'
    this.id = query.id ?? ''
    this.orderId = query.orderId ?? ''
    this.idempotencyKey = newIdempotencyKey()
    const title = isProcess ? copy.screen.title.processAfter : copy.screen.title.createAfter
    this.setData({ isProcess, title })
    void this.load()
  },
  onUnload() {
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    if (this.data.isProcess) await this.loadAfter()
    else await this.loadOrder()
  },
  async loadAfter(): Promise<void> {
    const result = await request(contract.getAfter, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    this.showAfter(result.data)
  },
  showAfter(after: AfterDetail) {
    this.after = after
    this.setData({
      loaded: true,
      failure: null,
      note: after.note ?? '',
      info: rowsOf([
        [copy.screen.label.sourceOrder, after.orderNo],
        [copy.screen.label.customerStore, copy.org.store(after.customerName, after.storeName)],
      ]),
    })
    this.setLines(processLinesOf(after), false)
  },
  async loadOrder(): Promise<void> {
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
        [copy.screen.label.customerStore, copy.org.store(order.customerName, order.storeName)],
      ]),
    })
  },
  setLines(lines: FormLine[], changed = true) {
    this.setData({
      lines,
      amountTexts: amountTextsOf(lines),
      totalRows: totalRowsOf(lines),
      lineErrors: lineErrorsOf({}, lines.length),
      formError: '',
    })
    markChanged(this, changed)
  },
  update(index: number, patch: Partial<FormLine>) {
    this.setLines(this.data.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  },
  onQty(event: IndexDetail<number>) {
    this.update(event.currentTarget.dataset.index, { qty: event.detail })
  },
  onPrice(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { priceText: event.detail })
  },
  onReason(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { reason: event.detail })
  },
  onDescription(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { description: event.detail })
  },
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail })
    markChanged(this, true)
  },
  onRemoveLine(event: DetailEvent<unknown, { index: number }>) {
    const { index } = event.currentTarget.dataset
    this.setLines(this.data.lines.filter((_, i) => i !== index))
  },
  onOpenPick() {
    const added = new Set(this.data.lines.map((line) => line.id))
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
    if (line) this.setLines([...this.data.lines, createLineOf(line)])
  },
  showFields(fields: Record<string, string>) {
    this.setData({
      lineErrors: lineErrorsOf(fields, this.data.lines.length),
      formError: unplacedErrorOf(fields, ['lines.*.qty', 'lines.*.priceCents', 'lines.*.reason']),
    })
  },
  async onSubmit(): Promise<void> {
    const { lines, note } = this.data
    const after = this.after
    if (after) {
      const checked = checkProcess(lines, note, after.version)
      if (!checked.ok) {
        this.showFields(checked.fields)
        return
      }
      this.setData({ saving: true, formError: '' })
      const input = { params: { id: after.id }, body: checked.body }
      this.afterSubmit(await request(contract.processAfter, input))
      return
    }
    const checked = checkCreate(lines, note, this.orderId)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '' })
    const options = { idempotencyKey: this.idempotencyKey }
    this.afterSubmit(await request(contract.createAfter, { body: checked.body }, options))
  },
  afterSubmit(result: Result<AfterDetail>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(copy.after.processed)
      if (this.data.isProcess) void wx.navigateBack()
      else
        void wx.redirectTo({ url: `/packages/sales/pages/after-detail/index?id=${result.data.id}` })
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'fields') this.showFields(view.fields)
    else if (view.kind === 'page') this.setData({ failure: view })
    else if (view.kind === 'stale') {
      this.showAfter(view.latest as AfterDetail)
      this.setData({ formError: view.message })
    } else this.setData({ formError: view.message })
  },
  onPreview: previewImage,
  onFailureAction() {
    void this.load()
  },
})
