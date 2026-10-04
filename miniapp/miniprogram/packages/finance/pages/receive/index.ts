import {
  contract,
  financeCopy as f,
  financeTexts,
  formatMoney,
  shanghaiDateOf,
  type ReceiptCreate,
  type PaymentCreate,
  type StatementCard,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import { unplacedErrorOf } from '../../../../core/form'
import type { FailureView } from '../../../../core/failure-view'
import { isChanged, markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watch } from '../../../../core/live'
import { firstFailure, newIdempotencyKey, request, type Failure } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { loadCustomers } from '../../../../views/customers'
import { loadSuppliers } from '../../../../views/purchase-load'
import { textOfCents } from '../../../../core/money'
import { periodTextOf } from '../../../../views/statement'
import {
  checkReceipt,
  checkPayment,
  selectedTotalOf,
  settlementSummaryOf,
  type ReceiveForm,
} from './form'
function pickRowOf(card: StatementCard, selected: boolean) {
  return {
    id: card.id,
    selected,
    no: card.no,
    period: periodTextOf(card.periodFrom, card.periodTo),
    due: formatMoney(card.dueCents),
  }
}
function blank(today: string): ReceiveForm {
  return {
    receiptDate: today,
    amountText: '',
    discountText: '',
    discountReason: '',
    methodName: '',
    note: '',
    statements: [],
  }
}
const DEFAULT_TITLE: string = f.registerReceipt
Page({
  data: {
    changed: false,
    isPayment: false,
    needsReview: false,
    title: DEFAULT_TITLE,
    today: '',
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    fields: {},
    partyId: '',
    partyName: '',
    partyOptions: [] as { id: string; name: string }[],
    methodOptions: [] as { id: string; name: string }[],
    form: blank(''),
    initial: blank(''),
    rows: [] as ReturnType<typeof pickRowOf>[],
    summary: { due: '', meta: '', short: false },
    partyLocked: false,
    changes: [] as string[],
    saving: false,
    texts: financeTexts,
  },
  idempotencyKey: '',
  loadVersion: 0,
  candidates: [] as StatementCard[],
  preselected: '',
  amountEdited: false,
  onLoad(query: Record<string, string | undefined>) {
    const isPayment = query.kind === 'payment',
      today = shanghaiDateOf(Date.now())
    this.idempotencyKey = newIdempotencyKey()
    this.preselected = query.statementId ?? ''
    this.setData({
      isPayment,
      title: isPayment ? f.registerPayment : f.registerReceipt,
      today,
      partyId: (isPayment ? query.supplierId : query.customerId) ?? '',
      partyLocked: Boolean(isPayment ? query.supplierId : query.customerId),
      form: blank(today),
      initial: blank(today),
    })
    void this.loadOptions()
  },
  onShow() {
    if (this.data.partyId) this.watchParty()
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  watchParty() {
    watch(
      this,
      [this.data.isPayment ? `ap:${this.data.partyId}` : `ar:${this.data.partyId}`],
      () => {
        this.setData({ needsReview: true, formError: f.staleReview })
      },
    )
  },
  async loadOptions() {
    const [parties, methods] = await Promise.all([
      this.data.isPayment ? loadSuppliers() : loadCustomers(),
      request(contract.listMethods),
    ])
    if (!parties.ok || !methods.ok) {
      const fail = firstFailure([parties, methods])
      if (fail) this.setData({ failure: failureOf(fail, 'load') })
      return
    }
    this.setData({
      partyOptions: parties.data.map(({ id, name }) => ({ id, name })),
      partyName: parties.data.find((party) => party.id === this.data.partyId)?.name ?? '',
      methodOptions: methods.data.items
        .filter((item) => item.enabled)
        .map((item) => ({ id: item.name, name: item.name })),
      loaded: true,
    })
    if (this.data.partyId) await this.loadStatements(true)
  },
  async loadStatements(reset: boolean) {
    const seq = ++this.loadVersion
    const result = await request(
      this.data.isPayment
        ? contract.listUnsettledSupplierStatements
        : contract.listUnsettledCustomerStatements,
      { params: { id: this.data.partyId } },
    )
    if (seq !== this.loadVersion) return false
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return false
    }
    const previous = this.data.form.statements
    this.candidates = result.data.items
    const ids = new Set(reset ? [this.preselected] : previous.map((item) => item.id))
    const selected = this.candidates.filter((item) => ids.has(item.id))
    const changes = reset
      ? []
      : previous.flatMap((item) => {
          const latest = selected.find((next) => next.id === item.id)
          return !latest
            ? [`${item.no} · ${f.settled}`]
            : latest.version !== item.version || latest.dueCents !== item.dueCents
              ? [`${item.no} · ${f.sourceChanged}`]
              : []
        })
    const form = { ...this.data.form, statements: selected }
    if (reset) form.amountText = selected.length ? textOfCents(selectedTotalOf(form)) : ''
    this.setData({ loaded: true, failure: null, changes, ...(reset ? { initial: form } : {}) })
    this.render(form)
    return true
  },
  render(form: ReceiveForm) {
    const ids = new Set(form.statements.map((item) => item.id))
    this.setData({
      form,
      rows: this.candidates.map((item) => pickRowOf(item, ids.has(item.id))),
      summary: settlementSummaryOf(form, this.data.isPayment),
    })
    markChanged(this, isChanged(this.data.initial, form))
  },
  onField(event: DetailEvent<string, { key: keyof ReceiveForm }>) {
    if (event.currentTarget.dataset.key === 'amountText') this.amountEdited = true
    this.setData({ formError: '', fields: {} })
    this.render({ ...this.data.form, [event.currentTarget.dataset.key]: event.detail })
  },
  onStatement(event: KeyEvent) {
    const card = this.candidates.find((item) => item.id === event.currentTarget.dataset.key)
    if (!card) return
    const chosen = this.data.form.statements.some((item) => item.id === card.id)
    const form = {
      ...this.data.form,
      statements: chosen
        ? this.data.form.statements.filter((item) => item.id !== card.id)
        : [...this.data.form.statements, card],
    }
    if (!this.amountEdited)
      form.amountText = form.statements.length ? textOfCents(selectedTotalOf(form)) : ''
    this.render(form)
  },
  onOpenStatement(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/statement-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
  async onParty(event: DetailEvent<string>) {
    if (event.detail === this.data.partyId) return
    this.amountEdited = false
    this.preselected = ''
    this.setData({
      partyId: event.detail,
      needsReview: false,
      changes: [],
      form: blank(this.data.today),
      fields: {},
      formError: '',
    })
    this.watchParty()
    await this.loadStatements(true)
  },
  async onReview() {
    if (await this.loadStatements(false))
      this.setData({ needsReview: false, formError: '', fields: {} })
  },
  onFailureAction() {
    void this.loadOptions()
  },
  showFields(fields: Record<string, string>) {
    this.setData({
      fields,
      formError: unplacedErrorOf(fields, [
        'customerId',
        'supplierId',
        'receiptDate',
        'payDate',
        'amountCents',
        'discountCents',
        'discountReason',
        'methodName',
      ]),
    })
  },
  async showSubmitFailure(failure: Failure) {
    const fail = failureOf(failure, 'submit')
    if (fail?.kind === 'stale') {
      await this.loadStatements(false)
      this.setData({ needsReview: true, formError: f.staleReview })
      this.idempotencyKey = newIdempotencyKey()
      return
    }
    if (fail?.kind === 'fields') {
      this.showFields(fail.fields)
      return
    }
    if (fail?.kind === 'page') {
      this.setData({ failure: fail })
      return
    }
    this.setData({ formError: fail?.message ?? '' })
  },
  async onSubmit() {
    if (this.data.saving) return
    if (this.data.needsReview) {
      await this.onReview()
      return
    }
    const checked = this.data.isPayment
      ? checkPayment(this.data.form, this.data.partyId, this.data.today)
      : checkReceipt(this.data.form, this.data.partyId, this.data.today)
    if (!checked.ok) {
      this.showFields(checked.fields)
      return
    }
    this.setData({ saving: true, formError: '', fields: {} })
    const result = this.data.isPayment
      ? await request(
          contract.createPayment,
          { body: checked.body as PaymentCreate },
          { idempotencyKey: this.idempotencyKey },
        )
      : await request(
          contract.createReceipt,
          { body: checked.body as ReceiptCreate },
          { idempotencyKey: this.idempotencyKey },
        )
    this.setData({ saving: false })
    if (result.ok) {
      syncUnloadAlert(false)
      void wx.navigateBack()
      return
    }
    await this.showSubmitFailure(result.failure)
  },
})
