import { contract, copy, formatMoney, formatTime, type PaymentDetail } from '@huazhong/shared'
import { canDo } from '../core/actions'
import { checkedOf, unplacedErrorOf } from '../core/form'
import { request } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { rowsOf } from './order'

function viewOf(p: PaymentDetail) {
  return {
    title: p.no,
    statusKind: 'recordStatus',
    status: p.status,
    canVoid: canDo(p.actions, 'voidPayment'),
    rows: rowsOf([
      [copy.screen.label.supplier, p.supplierName],
      [copy.screen.title.purchaseOrders, p.docNo],
      [copy.screen.label.amount, formatMoney(p.amountCents)],
      [copy.screen.label.methodShort, p.methodName],
      [copy.screen.label.date, p.payDate],
      [copy.field.note, p.note],
      [copy.screen.label.voidReason, p.voidReason],
      [copy.screen.label.voidedAt, p.voidedAt ? formatTime(p.voidedAt) : null],
    ]),
  }
}
export const paymentPanelData = {
  paymentLayer: '',
  paymentError: '',
  paymentFields: {} as Record<string, string>,
  paymentReason: '',
  paymentBusy: false,
  paymentView: null as ReturnType<typeof viewOf> | null,
  paymentTexts: {
    title: copy.screen.title.payment,
    void: copy.screen.action.voidPayment,
    reason: copy.screen.label.voidReason,
    confirm: copy.screen.action.confirmVoid,
  },
}
interface Host {
  setData(patch: Record<string, unknown>): void
}
export class PaymentPanel {
  private payment: PaymentDetail | null = null
  constructor(
    private readonly host: Host,
    private readonly onChanged: () => void,
  ) {}
  show(payment: PaymentDetail) {
    this.payment = payment
    this.host.setData({ paymentView: viewOf(payment), paymentFields: {} })
  }
  async open(id: string) {
    this.host.setData({
      paymentLayer: 'detail',
      paymentView: null,
      paymentError: '',
      paymentReason: '',
    })
    const result = await request(contract.getPayment, { params: { id } })
    if (result.ok) this.show(result.data)
    else this.host.setData({ paymentError: failureOf(result.failure, 'refresh')?.message ?? '' })
  }
  close() {
    this.host.setData({ paymentLayer: '', paymentReason: '' })
  }
  back() {
    this.host.setData({
      paymentLayer: 'detail',
      paymentError: '',
      paymentReason: '',
      paymentFields: {},
    })
  }
  void() {
    this.host.setData({
      paymentLayer: 'void',
      paymentError: '',
      paymentReason: '',
      paymentFields: {},
    })
  }
  reason(text: string) {
    this.host.setData({ paymentReason: text, paymentError: '', paymentFields: {} })
  }
  async refresh() {
    if (!this.payment) return
    const result = await request(contract.getPayment, { params: { id: this.payment.id } })
    if (result.ok) this.show(result.data)
  }
  async submit(reason: string) {
    if (!this.payment) return
    const checked = checkedOf(
      contract.voidPayment.body.safeParse({ version: this.payment.version, reason }),
    )
    if (!checked.ok) {
      this.host.setData({
        paymentFields: checked.fields,
        paymentError: unplacedErrorOf(checked.fields, ['reason']),
      })
      return
    }
    this.host.setData({ paymentBusy: true, paymentError: '', paymentFields: {} })
    const result = await request(contract.voidPayment, {
      params: { id: this.payment.id },
      body: checked.body,
    })
    this.host.setData({ paymentBusy: false })
    if (result.ok) {
      this.show(result.data)
      this.back()
      showSuccess(copy.finance.paymentVoided)
      this.onChanged()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') this.show(view.latest as PaymentDetail)
    this.host.setData({
      paymentFields: view.kind === 'fields' ? view.fields : {},
      paymentError:
        view.kind === 'fields' ? unplacedErrorOf(view.fields, ['reason']) : messageOf(view),
    })
  }
}
interface PanelHost {
  panel: PaymentPanel | null
  data: { paymentReason: string }
}
export const paymentPanelHandlers = {
  onClosePayment(this: PanelHost) {
    this.panel?.close()
  },
  onBackPayment(this: PanelHost) {
    this.panel?.back()
  },
  onVoidPayment(this: PanelHost) {
    this.panel?.void()
  },
  onPaymentReason(this: PanelHost, event: { detail: string }) {
    this.panel?.reason(event.detail)
  },
  onSubmitPaymentVoid(this: PanelHost) {
    void this.panel?.submit(this.data.paymentReason)
  },
}
