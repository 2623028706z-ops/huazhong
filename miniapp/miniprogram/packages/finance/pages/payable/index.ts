import {
  contract,
  copy,
  formatMoney,
  labels,
  shanghaiDateOf,
  type OutputOf,
  type PaymentMethod,
} from '@huazhong/shared'
import { buttonsOf, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf, unplacedErrorOf } from '../../../../core/form'
import { isChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { poViewOf } from '../../../../views/purchase'
import {
  PaymentPanel,
  paymentPanelData,
  paymentPanelHandlers,
} from '../../../../views/payment-panel'
type Payable = OutputOf<typeof contract.getPayable>
function blank() {
  return { payDate: shanghaiDateOf(Date.now()), methodName: '', note: '' }
}
Page({
  ...unwatchOnLeave,
  ...paymentPanelHandlers,
  data: {
    ...paymentPanelData,
    title: copy.screen.title.payable,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof poViewOf> | null,
    buttons: [] as ButtonView[],
    busy: '',
    register: false,
    form: blank(),
    initial: blank(),
    changed: false,
    methods: [] as PaymentMethod[],
    options: [] as { id: string; name: string }[],
    error: '',
    fields: {},
    amount: '',
    hasPayment: false,
    noPayment: false,
    today: shanghaiDateOf(Date.now()),
    texts: {
      ...copy.screen.label,
      pay: copy.screen.action.pay,
      confirm: copy.screen.action.confirmPayment,
      viewPayment: copy.screen.action.viewPayment,
      note: copy.field.note,
      noPayment: copy.screen.noPaymentNeeded,
    },
  },
  id: '',
  payable: null as Payable | null,
  panel: null as PaymentPanel | null,
  key: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.panel = new PaymentPanel(this, () => void this.load())
  },
  onShow() {
    void this.load()
    watch(this, [`payable:po:${this.id}`], () => {
      void this.load()
      if (this.data.paymentLayer) void this.panel?.refresh()
    })
  },
  onUnload() {
    unwatchOnLeave.onUnload.call(this)
    syncUnloadAlert(false)
  },
  async load() {
    const result = await request(contract.getPayable, { params: { docType: 'po', id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const changed =
      this.payable?.payableCents !== undefined &&
      this.payable.payableCents !== result.data.payableCents
    this.payable = result.data
    this.setData({
      loaded: true,
      failure: null,
      view: poViewOf(result.data),
      buttons: buttonsOf(result.data.actions, [{ code: 'pay' }]),
      hasPayment: result.data.payment !== null,
      noPayment: result.data.apStatus === 'no_pay',
      amount: formatMoney(result.data.payableCents),
    })
    if (result.data.apStatus === 'no_pay') this.onCloseRegister()
    if (this.data.register && changed)
      this.setData({
        error: copy.finance.paymentAmountStale(formatMoney(result.data.payableCents)),
      })
  },
  async onAction(event: CodeEvent) {
    if (event.currentTarget.dataset.code !== 'pay') return
    await this.load()
    if (!this.data.buttons.some((b) => b.code === 'pay' && !b.disabled)) return
    const result = await request(contract.listMethods, { query: { kind: 'pay' } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    this.key = newIdempotencyKey()
    const form = blank()
    this.setData({
      register: true,
      form,
      initial: form,
      error: '',
      fields: {},
      changed: false,
      options: result.data.items
        .filter((m) => m.enabled)
        .map((m) => ({ id: m.name, name: m.name })),
    })
  },
  onViewPayment() {
    if (this.payable?.payment) void this.panel?.open(this.payable.payment.id)
  },
  update(patch: Partial<ReturnType<typeof blank>>) {
    const form = { ...this.data.form, ...patch },
      changed = isChanged(this.data.initial, form)
    this.setData({ form, changed, fields: {}, error: '' })
    syncUnloadAlert(changed)
  },
  onDate(event: DetailEvent<string>) {
    this.update({ payDate: event.detail })
  },
  onMethod(event: DetailEvent<string>) {
    this.update({ methodName: event.detail })
  },
  onNote(event: DetailEvent<string>) {
    this.update({ note: event.detail })
  },
  onCloseRegister() {
    this.setData({ register: false, changed: false })
    syncUnloadAlert(false)
  },
  async onSubmit() {
    if (!this.payable) return
    const checked = checkedOf(
      contract.createPayment.body.safeParse({
        ...this.data.form,
        docType: 'po',
        docId: this.id,
        amountCents: this.payable.payableCents,
      }),
    )
    if (!checked.ok) {
      this.setData({
        fields: checked.fields,
        error: unplacedErrorOf(checked.fields, ['payDate', 'methodName', 'note']),
      })
      return
    }
    this.setData({ busy: 'pay', error: '' })
    const result = await request(
      contract.createPayment,
      { body: checked.body },
      { idempotencyKey: this.key },
    )
    this.setData({ busy: '' })
    if (result.ok) {
      this.onCloseRegister()
      showSuccess(labels.apStatus.paid)
      await this.load()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'page') this.setData({ failure: view })
    else {
      if (view.kind === 'stale') await this.load()
      this.setData({
        error:
          view.kind === 'fields'
            ? unplacedErrorOf(view.fields, ['payDate', 'methodName', 'note'])
            : messageOf(view),
        fields: view.kind === 'fields' ? view.fields : {},
      })
    }
  },
  onFailureAction() {
    void this.load()
  },
})
