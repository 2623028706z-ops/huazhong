// F4 登记收款 / 核销预收（06 章 F4）：从 F3 进时默认这个客户。
// 登记收款：客户、收款日期（默认今天，不能选以后）、金额、收款方式、备注 → 核销明细 → 汇总；
// 核销预收：客户 →「可用预收」→ 核销明细。保存后回 F3
import { contract, copy, shanghaiDateOf, type ArCard } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import {
  allocLinesOf,
  allocRowsOf,
  checkAllocate,
  checkReceipt,
  fillText,
  summaryOf,
  type ReceiveForm,
} from './form'
import { centsOfText } from '../../../../core/money'

type RowEvent<T> = DetailEvent<T, { index: number }>

const DEFAULT_TITLE: string = copy.screen.title.registerReceipt

function blankForm(today: string): ReceiveForm {
  return { receiptDate: today, amountText: '', methodName: '', note: '', allocs: [] }
}

Page({
  data: {
    changed: false,
    isAllocate: false,
    title: DEFAULT_TITLE,
    today: '',
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    customerId: '',
    customerOptions: [] as { id: string; name: string }[],
    methodOptions: [] as { id: string; name: string }[],
    prepaidCents: 0,
    form: blankForm(''),
    initial: blankForm(''),
    allocRows: [] as ReturnType<typeof allocRowsOf>,
    summary: '',
    saving: false,
    texts: {
      receipt: copy.screen.section.receipt,
      customer: copy.screen.label.customer,
      date: copy.field.receiptDate,
      amount: copy.screen.label.receiptAmount,
      method: copy.field.method,
      note: copy.field.note,
      optional: copy.placeholder.optional,
      allocDetail: copy.screen.label.allocDetail,
      allocThis: copy.screen.label.allocThis,
      fill: copy.screen.action.fill,
      confirmReceipt: copy.screen.action.confirmReceipt,
      confirmAllocate: copy.screen.action.confirmAllocate,
      empty: copy.state.empty(copy.screen.empty.arOrders),
    },
  },
  idempotencyKey: '',
  onLoad(query: Record<string, string | undefined>) {
    const isAllocate = query.mode === 'allocate'
    const today = shanghaiDateOf(Date.now())
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      isAllocate,
      title: isAllocate ? copy.screen.title.allocate : copy.screen.title.registerReceipt,
      today,
      customerId: query.customerId ?? '',
      form: blankForm(today),
      initial: blankForm(today),
    })
    void this.loadOptions()
  },
  onShow() {
    if (this.data.customerId) this.watchCustomer()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  // 别人登记了收款、作废了售后：未收变了，下次提交以后端为准，这里静默刷新未收
  watchCustomer() {
    watch(this, [`ar:${this.data.customerId}`], () => void this.loadUnpaid(false))
  },
  async loadOptions(): Promise<void> {
    const [customers, methods] = await Promise.all([
      loadCustomers(),
      request(contract.listMethods, { query: { kind: 'receive' } }),
    ])
    if (!customers.ok || !methods.ok) {
      const failure = firstFailure([customers, methods])
      if (failure) this.setData({ failure: failureOf(failure, 'load') })
      return
    }
    this.setData({
      customerOptions: customers.data.map(({ id, name }) => ({ id, name })),
      methodOptions: methods.data.items
        .filter((method) => method.enabled)
        .map((method) => ({ id: method.name, name: method.name })),
    })
    if (this.data.customerId) await this.loadUnpaid(true)
    else this.setData({ loaded: true })
  },
  async loadUnpaid(reset: boolean): Promise<void> {
    const result = await request(contract.listUnpaidOrders, {
      params: { id: this.data.customerId },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.setData({ loaded: true, failure: null, prepaidCents: result.data.prepaidCents })
    this.applyUnpaid(result.data.items, reset)
  },
  // 重新取未收：已填的核销按单号保留
  applyUnpaid(cards: ArCard[], reset: boolean) {
    const filled = new Map(this.data.form.allocs.map((line) => [line.orderId, line.text]))
    const allocs = allocLinesOf(cards).map((line) => ({
      ...line,
      text: reset ? '' : (filled.get(line.orderId) ?? ''),
    }))
    const form = { ...this.data.form, allocs }
    if (reset) this.setData({ initial: form })
    this.render(form)
  },
  render(form: ReceiveForm) {
    this.setData({
      form,
      allocRows: allocRowsOf(form.allocs),
      summary: summaryOf(form, this.data.isAllocate, this.data.prepaidCents),
    })
    markChanged(this, isChanged(this.data.initial, form))
  },
  update(patch: Partial<ReceiveForm>, field: string) {
    const fields = Object.fromEntries(
      Object.entries(this.data.fields).filter(([key]) => !key.startsWith(field)),
    )
    this.setData({ fields, formError: '' })
    this.render({ ...this.data.form, ...patch })
  },
  async onCustomer(event: DetailEvent<string>): Promise<void> {
    this.setData({ customerId: event.detail, fields: {}, formError: '' })
    this.watchCustomer()
    await this.loadUnpaid(true)
  },
  onDate(event: DetailEvent<string>) {
    this.update({ receiptDate: event.detail }, 'receiptDate')
  },
  onAmount(event: DetailEvent<string>) {
    this.update({ amountText: event.detail }, 'amountCents')
  },
  onMethod(event: DetailEvent<string>) {
    this.update({ methodName: event.detail }, 'methodName')
  },
  onNote(event: DetailEvent<string>) {
    this.update({ note: event.detail }, 'note')
  },
  setAlloc(index: number, text: string) {
    const allocs = this.data.form.allocs.map((line, i) => (i === index ? { ...line, text } : line))
    this.update({ allocs }, 'allocs')
  },
  onAlloc(event: RowEvent<string>) {
    this.setAlloc(event.currentTarget.dataset.index, event.detail)
  },
  onFill(event: DetailEvent<unknown, { index: number }>) {
    const { index } = event.currentTarget.dataset
    const { form, isAllocate, prepaidCents } = this.data
    const available = isAllocate ? prepaidCents : (centsOfText(form.amountText) ?? 0)
    this.setAlloc(index, fillText(form.allocs, index, available))
  },
  showFields(fields: Record<string, string>, message: string) {
    this.setData({ fields, formError: message, saving: false })
  },
  async onSubmit(): Promise<void> {
    const { form, customerId, isAllocate, today } = this.data
    const options = { idempotencyKey: this.idempotencyKey }
    if (isAllocate) {
      const checked = checkAllocate(form, customerId)
      if (!checked.ok) {
        this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
        return
      }
      this.setData({ saving: true })
      this.afterSubmit(await request(contract.allocatePrepaid, { body: checked.body }, options))
      return
    }
    const checked = checkReceipt(form, customerId, today)
    if (!checked.ok) {
      this.showFields(checked.fields, Object.values(checked.fields)[0] ?? '')
      return
    }
    this.setData({ saving: true })
    this.afterSubmit(await request(contract.createReceipt, { body: checked.body }, options))
  },
  afterSubmit(result: Result<unknown>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(this.data.isAllocate ? copy.finance.allocated : copy.finance.received)
      void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields, view.message)
    else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) {
      this.setData({ formError: view.message })
      void this.loadUnpaid(false)
    }
  },
  onFailureAction() {
    void this.loadOptions()
  },
})
