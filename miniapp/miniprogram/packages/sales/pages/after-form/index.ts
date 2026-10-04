// X7 售后表单（06 章 X7）：处理（processAfter，从 X6）、新建（从 X3、X5）。
// 原订单、客户门店 → 明细（数量上限 maxQty；单价默认发货单价）→ 售后金额合计 → 处理说明（选填）
import {
  contract,
  copy,
  redesignCopy,
  formatMoney,
  type AfterDetail,
  type OrderDetail,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { centsOfText } from '../../../../core/money'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { formOnLeave, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { watch } from '../../../../core/live'
import { previewImage, reasonOptions } from '../../../../views/after'
import { rowsOf } from '../../../../views/order'
import {
  checkCreate,
  checkProcess,
  createLineOf,
  lineErrorsOf,
  processLinesOf,
  type FormLine,
  type LineErrors,
} from './form'

const emptyLineErrors: LineErrors = { qty: '', price: '', reason: '', description: '' }
Page({
  ...formOnLeave,
  data: {
    changed: false,
    isProcess: false,
    title: '',
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    realtime: '',
    info: [] as { label: string; value: string }[],
    lines: [] as FormLine[],
    lineViews: [] as {
      key: string
      name: string
      qty: number
      unit: string
      priceCents: number
      amountCents: number
      tags: never[]
      meta: string
      qtyError: string
      priceError: string
    }[],
    draftErrors: emptyLineErrors,
    draftAmount: '',
    editIndex: -1,
    editor: false,
    draft: null as FormLine | null,
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
      subtotal: redesignCopy.subtotal,
      confirm: redesignCopy.confirm,
      remove: copy.screen.action.delete,
      yuan: copy.unit.yuan,
      qty: redesignCopy.qty,
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
  onShow() {
    syncUnloadAlert(this.data.changed)
    if (this.data.isProcess)
      watch(this, [`after:${this.id}`], () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      })
  },
  onRealtime() {
    void this.load()
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
    const order = await request(contract.getOrder, { params: { id: result.data.orderId } })
    if (!order.ok) {
      this.setData({ failure: failureOf(order.failure, 'load') })
      return
    }
    this.order = order.data
    this.showAfter(result.data)
  },
  showAfter(after: AfterDetail) {
    this.after = after
    this.setData({
      loaded: true,
      failure: null,
      realtime: '',
      note: after.note ?? '',
      info: rowsOf([
        [copy.screen.label.sourceOrder, after.orderNo],
        [copy.field.shipDate, after.shipDate],
        [copy.screen.label.customerStore, copy.org.store(after.customerName, after.storeName)],
      ]),
    })
    this.setLines(processLinesOf(after, this.order ?? undefined), false)
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
        [copy.field.shipDate, order.shipDate],
        [copy.screen.label.customerStore, copy.org.store(order.customerName, order.storeName)],
      ]),
    })
  },
  setLines(lines: FormLine[], changed = true) {
    this.setData({
      lines,

      lineErrors: lineErrorsOf({}, lines.length),
      formError: '',
    })
    this.renderLines()
    markChanged(this, changed)
  },
  update(index: number, patch: Partial<FormLine>) {
    this.setLines(this.data.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  },
  renderLines() {
    this.setData({
      lineViews: this.data.lines.map((line, index) => ({
        key: line.id,
        name: line.name,
        code: line.code,
        qty: line.qty,
        unit: line.unit,
        priceCents: centsOfText(line.priceText) ?? 0,
        amountCents: line.qty * (centsOfText(line.priceText) ?? 0),
        tags: [],
        meta: line.maxText,
        qtyError: this.data.lineErrors[index]?.qty ?? '',
        priceError: this.data.lineErrors[index]?.price ?? '',
      })),
    })
  },
  onEditLine(event: DetailEvent<number>) {
    const index = event.detail
    const line = this.data.lines[index]
    if (line)
      this.setData({
        editIndex: index,
        editor: true,
        draft: { ...line },
        draftErrors: this.data.lineErrors[index] ?? emptyLineErrors,
        draftAmount: formatMoney(line.qty * (centsOfText(line.priceText) ?? 0)),
      })
  },
  onDraft(event: DetailEvent<string | number, { field: string }>) {
    if (this.data.draft) {
      const draft = { ...this.data.draft, [event.currentTarget.dataset.field]: event.detail }
      this.setData({
        draft,
        draftErrors: emptyLineErrors,
        draftAmount: formatMoney(draft.qty * (centsOfText(draft.priceText) ?? 0)),
      })
    }
  },
  onCloseEditor() {
    this.setData({ editor: false })
  },
  onConfirmEditor() {
    const draft = this.data.draft
    if (!draft) return
    const checked = this.after
      ? checkProcess([draft], this.data.note, this.after.version)
      : checkCreate([draft], this.data.note, this.orderId)
    if (!checked.ok) {
      this.setData({ draftErrors: lineErrorsOf(checked.fields, 1)[0] ?? emptyLineErrors })
      return
    }
    this.update(this.data.editIndex, draft)
    this.setData({ editor: false })
  },
  onRemoveEdited() {
    this.setLines(this.data.lines.filter((_, index) => index !== this.data.editIndex))
    this.setData({ editor: false })
  },
  onNote(event: DetailEvent<string>) {
    this.setData({ note: event.detail })
    markChanged(this, true)
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
    if (line) {
      this.setLines([...this.data.lines, createLineOf(line)])
      this.onEditLine({ detail: this.data.lines.length - 1 } as DetailEvent<number>)
    }
  },
  showFields(fields: Record<string, string>) {
    this.setData({
      lineErrors: lineErrorsOf(fields, this.data.lines.length),
      formError: unplacedErrorOf(fields, [
        'lines.*.qty',
        'lines.*.priceCents',
        'lines.*.reason',
        'lines.*.description',
      ]),
    })
    this.renderLines()
    const key = Object.keys(fields).find((field) => /^lines\.\d+\./.test(field))
    if (key) this.onEditLine({ detail: Number(key.split('.')[1]) } as DetailEvent<number>)
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
