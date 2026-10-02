import {
  contract,
  copy,
  shanghaiDateOf,
  type PaymentDetail,
  type ReceiptDetail,
  type RefundDetail,
} from '@huazhong/shared'
import { canDo } from '../core/actions'
import { checkedOf, unplacedErrorOf } from '../core/form'
import { newIdempotencyKey, request, type Result } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'

import { centsOfText, textOfCents } from '../core/money'
import { fundViewOf } from './receipt-view'

export const paymentPanelData = {
  paymentLayer: '',
  paymentError: '',
  paymentFields: {} as Record<string, string>,
  paymentReason: '',
  paymentBusy: false,
  paymentView: null as ReturnType<typeof fundViewOf> | null,
  refundForm: { refundDate: '', amountText: '', methodName: '', note: '' },
  refundMethods: [] as { id: string; name: string }[],
  paymentTexts: {
    ...copy.rework,
    title: copy.screen.title.payment as string,
    void: copy.screen.action.voidPayment as string,
    reason: copy.screen.label.voidReason,
    confirm: copy.screen.action.confirmVoid,
    all: copy.filter.all,
    note: copy.field.note,
    confirmNotice: '' as string,
  },
}
interface Host {
  setData(patch: Record<string, unknown>): void
}
export class PaymentPanel {
  private payment: PaymentDetail | ReceiptDetail | null = null
  private kind: 'payment' | 'receipt' = 'payment'
  private operation: 'void' | 'revoke' | 'refundVoid' = 'void'
  private selectedId = ''
  private key = ''
  private busy = false
  private loadVersion = 0
  constructor(
    private readonly host: Host,
    private readonly onChanged: () => void,
  ) {}
  show(payment: PaymentDetail | ReceiptDetail) {
    this.payment = payment
    this.host.setData({ paymentView: fundViewOf(payment), paymentFields: {} })
  }
  async open(id: string, kind: 'payment' | 'receipt' = 'payment') {
    const version = ++this.loadVersion
    this.kind = kind
    this.payment = null
    this.key = newIdempotencyKey()
    this.host.setData({
      paymentLayer: 'detail',
      paymentView: null,
      paymentError: '',
      paymentReason: '',
      paymentTexts: {
        ...paymentPanelData.paymentTexts,
        title: kind === 'payment' ? copy.rework.paymentDetail : copy.rework.receiptDetail,
        void: kind === 'payment' ? copy.screen.action.voidPayment : copy.screen.action.voidReceipt,
      },
    })
    const result = await request(kind === 'payment' ? contract.getPayment : contract.getReceipt, {
      params: { id },
    })
    if (version !== this.loadVersion) return
    if (result.ok) this.show(result.data)
    else this.host.setData({ paymentError: failureOf(result.failure, 'refresh')?.message ?? '' })
  }
  close() {
    this.loadVersion++
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
    this.operation = 'void'
    this.host.setData({
      paymentLayer: 'void',
      paymentError: '',
      paymentReason: '',
      paymentFields: {},
      paymentTexts: {
        ...paymentPanelData.paymentTexts,
        title: this.kind === 'payment' ? copy.rework.paymentDetail : copy.rework.receiptDetail,
        void:
          this.kind === 'payment' ? copy.screen.action.voidPayment : copy.screen.action.voidReceipt,
      },
    })
  }
  reason(text: string) {
    this.host.setData({ paymentReason: text, paymentError: '', paymentFields: {} })
  }
  async refresh() {
    if (!this.payment) return
    const version = ++this.loadVersion
    const result = await request(
      this.kind === 'payment' ? contract.getPayment : contract.getReceipt,
      { params: { id: this.payment.id } },
    )
    if (version !== this.loadVersion) return
    if (result.ok) this.show(result.data)
    else this.host.setData({ paymentError: failureOf(result.failure, 'refresh')?.message ?? '' })
  }
  async submit(reason: string) {
    if (this.busy) return
    this.busy = true
    try {
      if (this.operation === 'revoke') await this.submitRevoke(reason)
      else if (this.operation === 'refundVoid') await this.submitRefundVoid(reason)
      else await this.submitFundsVoid(reason)
    } finally {
      this.busy = false
      this.host.setData({ paymentBusy: false })
    }
  }
  private async submitRevoke(reason: string) {
    const allocation = this.payment?.allocations.find(
      (allocation) => allocation.id === this.selectedId,
    )
    if (
      !allocation ||
      !canDo(
        allocation.actions,
        this.kind === 'payment' ? 'revokePaymentAllocation' : 'revokeAllocation',
      )
    )
      return
    const checked = checkedOf(contract.revokeAllocation.body.safeParse({ reason }))
    if (!checked.ok) {
      this.host.setData({ paymentError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.host.setData({ paymentBusy: true })
    await this.settle(
      await request(
        this.kind === 'payment' ? contract.revokePaymentAllocation : contract.revokeAllocation,
        { params: { id: this.selectedId }, body: checked.body },
      ),
    )
  }
  private async submitRefundVoid(reason: string) {
    const refund = this.payment?.refunds.find((refund) => refund.id === this.selectedId)
    if (!refund || !canDo(refund.actions, 'voidRefund')) return
    const checked = checkedOf(
      contract.voidRefund.body.safeParse({ version: refund.version, reason }),
    )
    if (!checked.ok) {
      this.host.setData({ paymentError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.host.setData({ paymentBusy: true })
    await this.settle(
      await request(contract.voidRefund, { params: { id: refund.id }, body: checked.body }),
    )
  }
  private async submitFundsVoid(reason: string) {
    if (
      !this.payment ||
      !canDo(this.payment.actions, this.kind === 'payment' ? 'voidPayment' : 'voidReceipt')
    )
      return
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
    await this.settle(
      await request(this.kind === 'payment' ? contract.voidPayment : contract.voidReceipt, {
        params: { id: this.payment.id },
        body: checked.body,
      }),
    )
  }
  revoke(id: string) {
    this.operation = 'revoke'
    this.selectedId = id
    this.host.setData({
      paymentLayer: 'void',
      paymentReason: '',
      paymentError: '',
      paymentFields: {},
      paymentTexts: {
        ...paymentPanelData.paymentTexts,
        title: this.kind === 'payment' ? copy.rework.paymentDetail : copy.rework.receiptDetail,
        void: copy.rework.revokeAllocation,
        reason: copy.screen.label.reason,
        confirm: copy.rework.revokeAllocation,
        confirmNotice: copy.rework.revokeConfirm,
      },
    })
  }
  voidRefund(id: string) {
    this.operation = 'refundVoid'
    this.selectedId = id
    this.host.setData({
      paymentLayer: 'void',
      paymentReason: '',
      paymentError: '',
      paymentFields: {},
      paymentTexts: {
        ...paymentPanelData.paymentTexts,
        title: this.kind === 'payment' ? copy.rework.paymentDetail : copy.rework.receiptDetail,
        void: copy.rework.voidRefund,
      },
    })
  }
  async refund() {
    if (
      !this.payment ||
      !canDo(this.payment.actions, this.kind === 'payment' ? 'refundPayment' : 'refundReceipt')
    )
      return
    const result = await request(contract.listMethods, {
      query: { kind: this.kind === 'payment' ? 'receive' : 'pay' },
    })
    if (!result.ok) {
      this.host.setData({ paymentError: failureOf(result.failure, 'refresh')?.message ?? '' })
      return
    }
    this.key = newIdempotencyKey()
    this.host.setData({
      paymentLayer: 'refund',
      paymentError: '',
      refundMethods: result.data.items
        .filter((method) => method.enabled)
        .map((method) => ({ id: method.name, name: method.name })),
      refundForm: {
        refundDate: shanghaiDateOf(Date.now()),
        amountText: '',
        methodName: '',
        note: '',
      },
    })
  }
  async submitRefund(form: typeof paymentPanelData.refundForm) {
    if (
      !this.payment ||
      !canDo(this.payment.actions, this.kind === 'payment' ? 'refundPayment' : 'refundReceipt')
    )
      return
    if (this.busy) return
    if (form.refundDate > shanghaiDateOf(Date.now())) {
      this.host.setData({ paymentError: copy.rework.refundDateFuture })
      return
    }
    const body = {
      kind: this.kind,
      ...(this.kind === 'payment'
        ? { paymentId: this.payment.id }
        : { receiptId: this.payment.id }),
      refundDate: form.refundDate,
      amountCents: centsOfText(form.amountText),
      methodName: form.methodName,
      note: form.note,
    }
    const checked = checkedOf(contract.createRefund.body.safeParse(body))
    if (!checked.ok) {
      this.host.setData({ paymentError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.busy = true
    this.host.setData({ paymentBusy: true })
    try {
      await this.settle(
        await request(contract.createRefund, { body: checked.body }, { idempotencyKey: this.key }),
      )
    } finally {
      this.busy = false
      this.host.setData({ paymentBusy: false })
    }
  }
  fillRefund() {
    if (this.payment)
      this.host.setData({ 'refundForm.amountText': textOfCents(this.payment.prepaidCents) })
  }
  private async settle(result: Result<PaymentDetail | ReceiptDetail | RefundDetail>) {
    this.host.setData({ paymentBusy: false })
    if (result.ok) {
      await this.refresh()
      this.back()
      this.onChanged()
      showSuccess(copy.action.saved)
      return
    }
    const failure = failureOf(result.failure, 'submit')
    if (failure?.kind === 'stale') await this.refresh()
    this.host.setData({ paymentError: failure ? messageOf(failure) : '' })
  }
}
interface PanelHost {
  panel: PaymentPanel | null
  data: { paymentReason: string; refundForm: typeof paymentPanelData.refundForm }
  setData(patch: Record<string, unknown>): void
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
  onRevokeAllocation(this: PanelHost, event: { currentTarget: { dataset: { key: string } } }) {
    this.panel?.revoke(event.currentTarget.dataset.key)
  },
  onVoidRefund(this: PanelHost, event: { currentTarget: { dataset: { key: string } } }) {
    this.panel?.voidRefund(event.currentTarget.dataset.key)
  },
  onRegisterRefund(this: PanelHost) {
    void this.panel?.refund()
  },
  onRefundField(
    this: PanelHost,
    event: { detail: string; currentTarget: { dataset: { field: string } } },
  ) {
    this.setData({
      refundForm: { ...this.data.refundForm, [event.currentTarget.dataset.field]: event.detail },
    })
  },
  onSubmitRefund(this: PanelHost) {
    void this.panel?.submitRefund(this.data.refundForm)
  },
  onFillRefund(this: PanelHost) {
    this.panel?.fillRefund()
  },
}
