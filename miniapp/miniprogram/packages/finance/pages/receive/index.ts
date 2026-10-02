// F4 登记收款 / 核销预收（06 章 F4）：从 F3 进时默认这个客户。
// 登记收款：客户、收款日期（默认今天，不能选以后）、金额、收款方式、备注 → 核销明细 → 汇总；
// 核销预收：客户 →「可用预收」→ 核销明细。保存后回 F3
import { contract, copy, shanghaiDateOf, type ArCard } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, newIdempotencyKey, request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { loadCustomers } from '../../../../views/customers'
import { loadSuppliers } from '../../../../views/purchase-load'
import {
  allocLinesOf,
  allocRowsOf,
  checkAllocate,
  checkReceipt,
  fillText,
  summaryOf,
  type ReceiveForm,
  paymentLinesOf,
  checkPayment,
  autoFillAll,
} from './form'
import { centsOfText } from '../../../../core/money'

type RowEvent<T> = DetailEvent<T, { index: number }>

const DEFAULT_TITLE: string = copy.screen.title.registerReceipt

// 收款 / 付款共用页面，付款模式在 onLoad 换成付款文案
const RECEIPT_TEXTS: Record<
  'receipt' | 'customer' | 'date' | 'amount' | 'confirmReceipt' | 'confirmAllocate',
  string
> = {
  receipt: copy.screen.section.receipt,
  customer: copy.screen.label.customer,
  date: copy.field.receiptDate,
  amount: copy.screen.label.receiptAmount,
  confirmReceipt: copy.screen.action.confirmReceipt,
  confirmAllocate: copy.screen.action.confirmAllocate,
}

function blankForm(today: string): ReceiveForm {
  return { receiptDate: today, amountText: '', methodName: '', note: '', allocs: [] }
}

Page({
  data: {
    changed: false,
    isAllocate: false,
    isPayment: false,
    ledgerToken: '',
    needsReview: false,
    ledgerChanges: [] as string[],
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
      ...RECEIPT_TEXTS,
      method: copy.field.method,
      note: copy.field.note,
      optional: copy.placeholder.optional,
      allocDetail: copy.screen.label.allocDetail,
      allocThis: copy.screen.label.allocThis,
      fill: copy.screen.action.fill,
      empty: copy.state.empty(copy.screen.empty.arOrders),
      recheck: copy.rework.recheck,
      ledgerChanges: copy.rework.ledgerChanges,
      viewDocumentHistory: copy.rework.viewDocumentHistory,
    },
  },
  idempotencyKey: '',
  loadVersion: 0,
  onLoad(query: Record<string, string | undefined>) {
    const isAllocate = query.mode === 'allocate'
    const isPayment = query.kind === 'payment'
    const today = shanghaiDateOf(Date.now())
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      isAllocate,
      isPayment,
      title: isPayment
        ? isAllocate
          ? copy.rework.allocatePaymentPrepaid
          : copy.screen.action.pay
        : isAllocate
          ? copy.screen.title.allocate
          : copy.screen.title.registerReceipt,
      today,
      customerId: (isPayment ? query.supplierId : query.customerId) ?? '',
      form: blankForm(today),
      initial: blankForm(today),
    })
    if (isPayment)
      this.setData({
        texts: {
          ...this.data.texts,
          receipt: copy.rework.paymentInfo,
          customer: copy.screen.label.supplier,
          date: copy.screen.label.paymentDate,
          amount: copy.rework.paymentAmount,
          confirmReceipt: copy.screen.action.confirmPayment,
          confirmAllocate: copy.rework.confirmAllocatePaymentPrepaid,
          empty: copy.rework.noUnpaidDocuments,
        },
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
    const topic = this.data.isPayment
      ? (`ap:${this.data.customerId}` as const)
      : (`ar:${this.data.customerId}` as const)
    watch(this, [topic], () => {
      this.setData({ needsReview: true, formError: copy.rework.ledgerChanged })
    })
  },
  async loadOptions(): Promise<void> {
    const [customers, methods] = await Promise.all([
      this.data.isPayment ? loadSuppliers() : loadCustomers(),
      request(contract.listMethods, { query: { kind: this.data.isPayment ? 'pay' : 'receive' } }),
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
  async loadUnpaid(reset: boolean): Promise<boolean> {
    const version = ++this.loadVersion
    if (this.data.isPayment) {
      const result = await request(contract.listUnpaidDocuments, {
        params: { id: this.data.customerId },
      })
      if (version !== this.loadVersion) return false
      if (!result.ok) {
        this.setData({ failure: failureOf(result.failure, 'refresh') })
        return false
      }
      const rows = paymentLinesOf(result.data.items)
      const allocs =
        reset && this.data.isAllocate ? autoFillAll(rows, result.data.prepaidCents) : rows
      this.setData({
        loaded: true,
        failure: null,
        prepaidCents: result.data.prepaidCents,
        ledgerToken: result.data.ledgerToken,
        needsReview: false,
      })
      const form = { ...this.data.form, allocs }
      if (reset) this.setData({ initial: form })
      this.render(form)
      return true
    }
    const result = await request(contract.listUnpaidOrders, {
      params: { id: this.data.customerId },
    })
    if (version !== this.loadVersion) return false
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    this.setData({
      loaded: true,
      failure: null,
      prepaidCents: result.data.prepaidCents,
      ledgerToken: result.data.ledgerToken,
      needsReview: false,
    })
    this.applyUnpaid(result.data.items, reset)
    return true
  },
  // 重新取未收：已填的核销按单号保留
  applyUnpaid(cards: ArCard[], reset: boolean) {
    const allocs = allocLinesOf(cards).map((line) => ({
      ...line,
      text: '',
    }))
    const form = {
      ...this.data.form,
      allocs: reset && this.data.isAllocate ? autoFillAll(allocs, this.data.prepaidCents) : allocs,
    }
    if (reset) this.setData({ initial: form })
    this.render(form)
  },
  render(form: ReceiveForm) {
    this.setData({
      form,
      allocRows: allocRowsOf(form.allocs),
      summary: summaryOf(form, this.data.isAllocate, this.data.prepaidCents, this.data.isPayment),
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
    this.update(
      {
        amountText: event.detail,
        allocs: autoFillAll(this.data.form.allocs, centsOfText(event.detail) ?? 0),
      },
      'amountCents',
    )
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
  showFields(fields: Record<string, string>) {
    this.setData({
      fields,
      formError: unplacedErrorOf(fields, [
        'customerId',
        'receiptDate',
        'amountCents',
        'methodName',
      ]),
      saving: false,
    })
  },
  async submitPayment(options: { idempotencyKey: string }): Promise<void> {
    const { form, customerId, isAllocate } = this.data
    const checked = checkPayment(form, customerId, this.data.ledgerToken, isAllocate)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true })
    const result = isAllocate
      ? await request(
          contract.allocatePaymentPrepaid,
          { body: contract.allocatePaymentPrepaid.body.parse(checked.body) },
          options,
        )
      : await request(
          contract.createPayment,
          { body: contract.createPayment.body.parse(checked.body) },
          options,
        )
    this.afterSubmit(result)
  },
  async onSubmit(): Promise<void> {
    if (this.data.saving) return
    const { form, customerId, isAllocate, today } = this.data
    const options = { idempotencyKey: this.idempotencyKey }
    if (this.data.isPayment && form.receiptDate > today) {
      this.showFields({ receiptDate: copy.finance.payDateFuture })
      return
    }
    if (this.data.needsReview) {
      await this.onReviewLedger()
      return
    }
    if (this.data.isPayment) {
      await this.submitPayment(options)
      return
    }
    if (isAllocate) {
      const checked = checkAllocate(form, customerId, this.data.ledgerToken)
      if (!checked.ok) {
        this.showFields(checked.fields)
        return
      }
      this.setData({ saving: true })
      this.afterSubmit(await request(contract.allocatePrepaid, { body: checked.body }, options))
      return
    }
    const checked = checkReceipt(form, customerId, today, this.data.ledgerToken)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true })
    this.afterSubmit(await request(contract.createReceipt, { body: checked.body }, options))
  },
  afterSubmit(result: Result<unknown>) {
    this.setData({ saving: false })
    if (result.ok) {
      markChanged(this, false)
      showSuccess(
        this.data.isAllocate
          ? copy.finance.allocated
          : this.data.isPayment
            ? copy.action.saved
            : copy.finance.received,
      )
      void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'fields') this.showFields(view.fields)
    else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) {
      this.setData({ formError: view.message })
      if (view.kind === 'stale') void this.onReviewLedger()
    }
  },
  async onReviewLedger() {
    const previous = new Map(this.data.form.allocs.map((line) => [line.orderId, line]))
    if (!(await this.loadUnpaid(false))) return
    const changes = this.data.form.allocs.flatMap((line) => {
      const before = previous.get(line.orderId)
      previous.delete(line.orderId)
      return !before || before.unpaidCents !== line.unpaidCents || before.version !== line.version
        ? [
            `${line.orderNo}${copy.separator}${copy.rework.ledgerDifference(before?.unpaidCents ?? 0, line.unpaidCents)}`,
          ]
        : []
    })
    changes.push(...[...previous.values()].map((line) => copy.rework.noLongerUnpaid(line.orderNo)))
    this.setData({ ledgerChanges: changes.length ? changes : [copy.rework.ledgerChanged] })
    this.idempotencyKey = newIdempotencyKey()
    this.setData({ formError: copy.rework.ledgerReviewed })
  },
  onOpenDocument(event: DetailEvent<unknown, { key: string }>) {
    if (this.data.isPayment)
      void wx.navigateTo({
        url: `/packages/finance/pages/payable/index?id=${event.currentTarget.dataset.key}`,
      })
    else
      void wx.navigateTo({
        url: `/packages/finance/pages/customer/index?id=${this.data.customerId}&orderId=${event.currentTarget.dataset.key}`,
      })
  },
  onFailureAction() {
    void this.loadOptions()
  },
})
