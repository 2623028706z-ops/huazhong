// F8 收付款记录（06 章 F8）：筛选状态、日期；三行卡片：日期 + 状态；客户 + 方式；单号 + 金额。
// 点开收款详情弹层（同 F3），可作废收款。阶段 3 只有收款，付款在阶段 4 加
import {
  contract,
  copy,
  recordStatuses,
  type ReceiptCard,
  type ReceiptDetail,
  type PaymentDetail,
  type RecordStatus,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { FilterValue } from '../../../../core/filter'
import { watch } from '../../../../core/live'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { listHandlers, listOf, listQueryOf } from '../../../../views/list'
import { recordRowOf, receiptViewOf } from '../../receipt-view'
import {
  PaymentPanel,
  paymentPanelData,
  paymentPanelHandlers,
} from '../../../../views/payment-panel'

Page({
  ...listHandlers,
  ...paymentPanelHandlers,
  data: {
    ...paymentPanelData,
    title: copy.screen.title.records,
    statusKind: 'recordStatus',
    statuses: [...recordStatuses],
    counts: {},
    kind: 'receipt',
    kindTabs: [
      { key: 'receipt', text: copy.log.kind.receipt },
      { key: 'payment', text: copy.log.kind.payment },
    ],
    dateLabel: copy.screen.label.date,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof recordRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.records,
    allLoaded: copy.state.allLoaded,
    sheet: false,
    sheetError: '',
    receiptSheet: null as ReturnType<typeof receiptViewOf> | null,
    voidSheet: false,
    voidError: '',
    busy: '',
    texts: {
      receipt: copy.screen.title.receipt,
      voidReceipt: copy.screen.action.voidReceipt,
      confirmVoid: copy.screen.action.confirmVoid,
    },
  },
  list: null as PagedList<ReceiptCard | PaymentDetail> | null,
  receipt: null as ReceiptDetail | null,
  panel: null as PaymentPanel | null,
  onLoad() {
    this.panel = new PaymentPanel(this, () => void this.list?.refresh())
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<RecordStatus>(this.data.filter)
        const kind: 'receipt' | 'payment' = this.data.kind === 'payment' ? 'payment' : 'receipt'
        const result = await request(contract.listFinanceRecords, {
          query: { kind, status, from, to, cursor },
        })
        if (result.ok && kind === this.data.kind) this.setData({ counts: result.data.counts })
        return result
      },
      recordRowOf,
    )
  },
  onShow() {
    void this.list?.refresh()
    watch(this, ['ap:*', 'ar:*'], () => {
      void this.list?.refresh()
      if (this.data.paymentLayer) void this.panel?.refresh()
    })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.list?.refresh()
  },
  onKind(event: DetailEvent<'receipt' | 'payment'>) {
    this.setData({ kind: event.detail, filter: emptyFilter, counts: {}, rows: [] })
    void this.list?.refresh()
  },
  async onOpen(event: KeyEvent): Promise<void> {
    const row = this.list
    const id = event.currentTarget.dataset.key
    const item = this.data.rows.find((item) => item.id === id)
    if (item && item.kind === 'payment') {
      await this.panel?.open(id)
      return
    }
    if (!row) return
    this.setData({ sheet: true, receiptSheet: null, sheetError: '' })
    const result = await request(contract.getReceipt, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
      return
    }
    this.receipt = result.data
    this.setData({ receiptSheet: receiptViewOf(result.data) })
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  onVoid() {
    this.setData({ voidSheet: true, voidError: '' })
  },
  onCloseVoid() {
    this.setData({ voidSheet: false })
  },
  async onSubmitVoid(event: DetailEvent<string>): Promise<void> {
    const receipt = this.receipt
    if (!receipt) return
    this.setData({ busy: 'void', voidError: '' })
    const input = {
      params: { id: receipt.id },
      body: { version: receipt.version, reason: event.detail },
    }
    const result = await request(contract.voidReceipt, input)
    this.setData({ busy: '' })
    if (result.ok) {
      this.receipt = result.data
      this.setData({ voidSheet: false, receiptSheet: receiptViewOf(result.data) })
      showSuccess(copy.finance.receiptVoided)
      void this.list?.refresh()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') {
      this.receipt = view.latest as ReceiptDetail
      this.setData({ receiptSheet: receiptViewOf(this.receipt) })
    }
    const message = messageOf(view)
    this.setData({ voidError: message })
  },
})
