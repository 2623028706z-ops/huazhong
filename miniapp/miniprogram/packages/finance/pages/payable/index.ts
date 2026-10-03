import { contract, copy, type OutputOf } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { poViewOf } from '../../../../views/purchase'
import {
  PaymentPanel,
  paymentPanelData,
  paymentPanelHandlers,
} from '../../../../views/payment-panel'
import { paymentAllocRowsOf } from '../../../../views/receipt-view'
import { stockViewOf } from '../../../../views/stock'

function docTypeOf(value?: string): 'po' | 'wh' {
  return value === 'wh' ? 'wh' : 'po'
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
    stockView: null as ReturnType<typeof stockViewOf> | null,
    allocations: [] as ReturnType<typeof paymentAllocRowsOf>,
  },
  id: '',
  docType: docTypeOf(),
  document: null as OutputOf<typeof contract.getApDocument> | null,
  panel: null as PaymentPanel | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.docType = docTypeOf(query.docType)
    this.panel = new PaymentPanel(this, () => void this.load())
  },
  onShow() {
    void this.load()
    watch(this, [`payable:${this.docType}:${this.id}`, 'ap:*'], () => {
      void this.load()
      if (this.data.paymentLayer) void this.panel?.refresh()
    })
  },
  async load() {
    const result = await request(contract.getApDocument, {
      params: { docType: this.docType, id: this.id },
    })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.document = result.data
    this.setData({
      loaded: true,
      failure: null,
      view: result.data.docType === 'po' ? poViewOf(result.data) : null,
      stockView: result.data.docType === 'wh' ? stockViewOf(result.data) : null,
      allocations: paymentAllocRowsOf(result.data.allocations),
    })
  },
  onOpenPayment(event: KeyEvent) {
    void this.panel?.open(event.currentTarget.dataset.key)
  },
  onFailureAction() {
    void this.load()
  },
})
