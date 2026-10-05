// S8 申请售后（06 章 S8）：原订单、出货日期 → 明细（数量上限 maxQty；问题原因、问题说明选填、图片）→「添加产品」（可多选）。
// 订单只有一个能申请的产品时进来直接打开它的编辑弹层；原因是「数量不符」（少发、漏发）时图片选填，其余原因至少 1 张。
// 套公共整页表单（02 章第 11 节，2026-10-06 第 4 批）：信息卡 → 售后明细（hz-line-item，点行改、底部添加）→ 底栏提交。
// 提交后进 S10 售后详情
import {
  contract,
  copy,
  entryCopy,
  financeCopy,
  labels,
  redesignCopy,
  type OrderDetail,
} from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { syncUnloadAlert, isChanged } from '../../../../core/guard'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { uploadImage, type LocalImage } from '../../../../core/upload'
import { rowsOf, shipDateText } from '../../../../views/order'
import { pickChosen, pickData, pickHandlers, pickOpen } from '../../../../views/pick'
import { reasonOptions } from '../../../../views/after'
import { checkForm, formLineOf, lineErrorsOf, type FormLine, type LineErrors } from './form'

type IndexDetail<T> = DetailEvent<T, { index: number }>

// 明细表一行：名称、数量、单位；小字客户产品编码、可申请数量、图片张数，问题原因做成标签
function lineViewsOf(lines: readonly FormLine[]) {
  return lines.map((line) => ({
    key: line.orderLineId,
    name: line.name,
    code: line.code ?? '',
    qty: line.qty,
    unit: line.unit,
    meta: [line.maxText, redesignCopy.imageCountText(line.images.length)].join(copy.separator),
    tags: line.reason
      ? [{ text: labels.afterReason[line.reason as keyof typeof labels.afterReason], warn: true }]
      : [],
  }))
}

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
    ...pickData(),
    saving: false,
    uploading: false,
    editIndex: -1,
    editorNew: false,
    editChanged: false,
    editInitial: null as FormLine | null,
    editLine: null as FormLine | null,
    editError: { qty: '', reason: '', description: '', images: '' },
    lineViews: [] as ReturnType<typeof lineViewsOf>,
    texts: {
      lines: copy.screen.section.afterLines,
      reason: copy.screen.label.afterReason,
      description: copy.screen.label.afterDescription,
      images: financeCopy.imagesRequired,
      imagesOptional: redesignCopy.afterImagesOptional,
      optional: copy.placeholder.optional,
      add: copy.screen.action.addProduct,
      submit: copy.screen.action.submitAfter,
      qty: financeCopy.afterQty,
      remove: copy.screen.action.delete,
      confirm: financeCopy.confirm,
      pickTitle: copy.screen.title.pickProduct,
      noPick: copy.state.empty(copy.screen.empty.addableProducts),
      searchProduct: entryCopy.searchProduct,
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
    // 只有一个能申请的产品：直接加进来并打开编辑
    const only = this.claimable([])
    if (only.length === 1 && only[0]) {
      this.setLines([formLineOf(only[0])])
      this.openEditor(0)
    }
  },
  // 这张单里还能申请、还没加进来的产品
  claimable(added: readonly string[]) {
    return (this.order?.lines ?? []).filter(
      (line) => (line.maxQty ?? 0) > 0 && !added.includes(line.id),
    )
  },
  setLines(lines: FormLine[]) {
    this.setData({
      lines,
      lineViews: lineViewsOf(lines),
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
  // 四选一：hz-choices 给的是选中的数组，点已选中的不取消，点新的换成新的
  onReason(event: IndexDetail<string[]>) {
    const { index } = event.currentTarget.dataset
    const line = this.data.editIndex === index ? this.data.editLine : this.data.lines[index]
    const current = line?.reason
    const next = event.detail.find((id) => id !== current)
    if (next) this.update(index, { reason: next })
  },
  onDescription(event: IndexDetail<string>) {
    this.update(event.currentTarget.dataset.index, { description: event.detail })
  },
  async onAddImages(event: IndexDetail<LocalImage[]>): Promise<void> {
    const { index } = event.currentTarget.dataset
    this.setData({ uploading: true, formError: '' })
    for (const file of event.detail) {
      const result = await uploadImage('after_image', file)
      if (!result.ok) {
        const message = result.failure
          ? (failureOf(result.failure, 'submit')?.message ?? '')
          : result.message
        this.setData({ editError: { ...this.data.editError, images: message } })
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
  // 只列这张单里还能申请、还没加进来的产品，可多选
  onOpenPick() {
    const picks = this.claimable(this.data.lines.map((line) => line.orderLineId)).map((line) => ({
      id: line.id,
      name: line.name,
      sub: copy.screen.maxQty(line.maxQty ?? 0),
      code: line.customerCode,
      max: line.maxQty ?? 0,
    }))
    this.setData({ pickSheet: true, ...pickOpen(picks) })
  },
  onClosePick() {
    this.setData({ pickSheet: false })
  },
  ...pickHandlers,
  // 选好的产品按选的数量一次加入；售后还要选问题原因，打开加的第一行，其余点行再逐个填。
  // 只加了一个时关掉弹层不填就撤回这一行
  onPickConfirm() {
    const added = pickChosen(this.data).flatMap(({ id, qty }) => {
      const line = this.order?.lines.find((l) => l.id === id)
      return line ? [formLineOf(line, qty)] : []
    })
    this.setData({ pickSheet: false })
    if (!added.length) return
    const first = this.data.lines.length
    this.setLines([...this.data.lines, ...added])
    this.openEditor(first)
    this.setData({ editorNew: added.length === 1 })
  },
  // hz-line-item custom 模式点行发 edit，detail 是行号
  onEditLine(event: DetailEvent<number>) {
    this.openEditor(event.detail)
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
