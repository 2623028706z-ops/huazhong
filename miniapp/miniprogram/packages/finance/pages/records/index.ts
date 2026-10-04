import {
  contract,
  copy,
  financeCopy as f,
  statementCopy,
  type ReceiptDetail,
  type PaymentDetail,
} from '@huazhong/shared'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { recordRowOf } from '../../../../views/receipt-view'
const DEFAULT_DATE_LABEL: string = f.receiptDate
function fundKindOf(): 'receipt' | 'payment' {
  return 'receipt'
}
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.records,
    statusKind: 'recordStatus',
    statuses: ['voided'],
    counts: {},
    kind: fundKindOf(),
    kindTabs: [
      { key: 'receipt', text: statementCopy.receiptDetail },
      { key: 'payment', text: statementCopy.paymentDetail },
    ],
    dateLabel: DEFAULT_DATE_LABEL,
    dimensions: [] as FilterDimension[],
    filter: emptyFilter,
    rows: [] as ReturnType<typeof recordRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.records,
    allLoaded: copy.state.allLoaded,
    searchPlaceholder: f.recordSearch(f.customer),
  },
  list: null as PagedList<ReceiptDetail | PaymentDetail> | null,
  onLoad() {
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to, q, picks } = listQueryOf<'valid' | 'voided'>(this.data.filter)
        const result = await request(contract.listFinanceRecords, {
          query: { kind: this.data.kind, partyId: picks.party, status, from, to, q, cursor },
        })
        if (result.ok) this.setData({ counts: result.data.counts })
        return result
      },
      (record) => ({ ...recordRowOf(record), status: record.status === 'valid' ? '' : 'voided' }),
    )
  },
  onShow() {
    showList(this, ['ap:*', 'ar:*'])
    void this.loadDimensions()
  },
  async loadDimensions() {
    const options: { id: string; name: string }[] = []
    let cursor: string | undefined
    for (;;) {
      const result = await request(
        this.data.kind === 'payment' ? contract.listFinanceSuppliers : contract.listArCustomers,
        { query: { cursor } },
      )
      if (!result.ok) return
      options.push(...result.data.items.map((row) => ({ id: row.partyId, name: row.partyName })))
      if (!result.data.nextCursor) break
      cursor = result.data.nextCursor
    }
    this.setData({
      dimensions: [
        { key: 'party', label: this.data.kind === 'payment' ? f.supplier : f.customer, options },
      ],
    })
  },
  onKind(event: DetailEvent<'receipt' | 'payment'>) {
    this.setData({
      kind: event.detail,
      dateLabel: event.detail === 'payment' ? f.paymentDate : f.receiptDate,
      filter: emptyFilter,
      counts: {},
      rows: [],
      searchPlaceholder: f.recordSearch(event.detail === 'payment' ? f.supplier : f.customer),
    })
    void this.list?.refresh()
    void this.loadDimensions()
  },
  onOpen(event: KeyEvent) {
    const item = this.data.rows.find((item) => item.id === event.currentTarget.dataset.key)
    if (item)
      void wx.navigateTo({
        url: `/packages/finance/pages/money/index?kind=${item.kind}&id=${item.id}`,
      })
  },
})
