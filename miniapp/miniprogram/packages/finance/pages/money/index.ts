import {
  contract,
  financeCopy as f,
  financeTexts,
  type ReceiptDetail,
  type PaymentDetail,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave } from '../../../../core/live'
import { fundViewOf } from '../../../../views/receipt-view'
const DEFAULT_TITLE: string = f.receiptDetail
Page({
  ...unwatchOnLeave,
  data: {
    title: DEFAULT_TITLE,
    isPayment: false,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof fundViewOf> | null,
    voidSheet: false,
    error: '',
    busy: false,
    texts: financeTexts,
  },
  id: '',
  fund: null as ReceiptDetail | PaymentDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    const isPayment = query.kind === 'payment'
    this.setData({ isPayment, title: isPayment ? f.paymentDetail : f.receiptDetail })
    void this.load()
  },
  onShow() {
    watch(
      this,
      [this.data.isPayment ? `payment:${this.id}` : `receipt:${this.id}`],
      () => void this.load(),
    )
  },
  async load() {
    const result = await request(this.data.isPayment ? contract.getPayment : contract.getReceipt, {
      params: { id: this.id },
    })
    if (result.ok) {
      this.fund = result.data
      this.setData({ loaded: true, failure: null, view: fundViewOf(result.data) })
    } else
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
  },
  onFailureAction() {
    void this.load()
  },
  onStatement(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/statement-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
  onVoid() {
    this.setData({ voidSheet: true, error: '' })
  },
  onCloseVoid() {
    this.setData({ voidSheet: false })
  },
  async onSubmitVoid(event: DetailEvent<string>) {
    if (!this.fund || this.data.busy) return
    const reason = event.detail.trim()
    if (!reason) {
      this.setData({ error: f.voidReason })
      return
    }
    this.setData({ busy: true, error: '' })
    const result = await request(
      this.data.isPayment ? contract.voidPayment : contract.voidReceipt,
      { params: { id: this.id }, body: { version: this.fund.version, reason } },
    )
    this.setData({ busy: false })
    if (result.ok) {
      this.setData({ voidSheet: false })
      await this.load()
    } else {
      const fail = failureOf(result.failure, 'submit')
      this.setData({ error: fail?.message ?? '' })
      if (fail?.kind === 'stale') await this.load()
    }
  },
})
