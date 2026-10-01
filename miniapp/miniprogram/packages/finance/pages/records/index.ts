// F8 收付款记录（06 章 F8）：筛选状态、日期；三行卡片：日期 + 状态；客户 + 方式；单号 + 金额。
// 点开收款详情弹层（同 F3），可作废收款。阶段 3 只有收款，付款在阶段 4 加
import {
  contract,
  copy,
  recordStatuses,
  type ReceiptCard,
  type ReceiptDetail,
  type RecordStatus,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { listHandlers, listOf, listQueryOf } from '../../../../views/list'
import { receiptRowOf, receiptViewOf } from '../../receipt-view'

Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.records,
    statusKind: 'recordStatus',
    statuses: [...recordStatuses],
    counts: {},
    dateLabel: copy.screen.label.date,
    filter: emptyFilter,
    rows: [] as ReturnType<typeof receiptRowOf>[],
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
  list: null as PagedList<ReceiptCard> | null,
  receipt: null as ReceiptDetail | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<RecordStatus>(this.data.filter)
        const query = { status, from, to, cursor }
        const result = await request(contract.listFinanceRecords, { query })
        if (result.ok) this.setData({ counts: result.data.counts })
        return result
      },
      receiptRowOf,
    )
  },
  onShow() {
    void this.list?.refresh()
  },
  async onOpen(event: KeyEvent): Promise<void> {
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
