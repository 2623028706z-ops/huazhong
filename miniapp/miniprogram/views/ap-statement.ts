import { contract, copy, labels, apStatuses, type ApCard, type OutputOf } from '@huazhong/shared'
import type { KeyEvent, CodeEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch } from '../core/live'
import { request } from '../core/request'
import { failureOf, loadMe } from '../core/session'
import { listHandlers, listOf, listQueryOf } from './list'
import { poRowOf, poViewOf } from './purchase'
import { buttonsOf, type ButtonView } from '../core/actions'
import { PaymentPanel, paymentPanelData, paymentPanelHandlers } from './payment-panel'
import { textOfCents } from '../core/money'
import { stockRowOf, stockViewOf } from './stock'

function rowOf(ap: ApCard) {
  return {
    ...(ap.docType === 'po' ? poRowOf(ap) : stockRowOf(ap)),
    id: `${ap.docType}:${ap.docId}`,
    docType: ap.docType,
    docId: ap.docId,
    date: ap.apDate,
    status: ap.apStatus,
    amount: ap.payableCents,
    title:
      ap.docType === 'po' ? ap.supplierName : `${ap.supplierName} · ${copy.stock.screen.stockIn}`,
  }
}
function cellsOf(
  ap: Pick<
    OutputOf<typeof contract.getFinanceSupplier>,
    'payableCents' | 'paidCents' | 'unpaidCents' | 'prepaidCents'
  >,
  own: boolean,
) {
  const cells: { label: string; amountCents: number; due: boolean }[] = [
    { label: copy.screen.label.payable, amountCents: ap.payableCents, due: false },
    { label: copy.screen.label.paid, amountCents: ap.paidCents, due: false },
    { label: copy.screen.label.due, amountCents: ap.unpaidCents, due: true },
  ]
  // 供应商端（P5）预付大于 0 才显示；财务（F6）始终显示全账预付
  if (!own || ap.prepaidCents > 0)
    cells.push({ label: copy.rework.availablePrepaid, amountCents: ap.prepaidCents, due: false })
  return cells
}
const data = {
  ...paymentPanelData,
  own: false,
  title: copy.screen.title.apSupplier as string,
  statusKind: 'apStatus',
  statuses: [...apStatuses],
  counts: {},
  filter: emptyFilter,
  dateLabel: copy.screen.label.date,
  rows: [] as ReturnType<typeof rowOf>[],
  cells: [] as ReturnType<typeof cellsOf>,
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: copy.screen.empty.payables,
  allLoaded: copy.state.allLoaded,
  sheet: false,
  sheetError: '',
  view: null as ReturnType<typeof poViewOf> | null,
  stockView: null as ReturnType<typeof stockViewOf> | null,
  buttons: [] as ButtonView[],
  refunds: [] as {
    no: string
    date: string
    amount: string
    status: string
    paymentId: string | null
  }[],
}
interface Host {
  data: typeof data
  id: string
  list: PagedList<ApCard> | null
  panel: PaymentPanel | null
  setData(patch: Record<string, unknown>): void
}
const methods = {
  ...listHandlers,
  ...paymentPanelHandlers,
  id: '',
  list: null as PagedList<ApCard> | null,
  panel: null as PaymentPanel | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.panel = new PaymentPanel(this, () => void this.list?.refresh())
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<ApCard['apStatus']>(this.data.filter),
          query = { status, from, to, cursor }
        const result = this.data.own
          ? await request(contract.supplierStatement, { query })
          : await request(contract.getFinanceSupplier, { params: { id: this.id }, query })
        if (result.ok)
          this.setData({
            counts: result.data.counts,
            cells: cellsOf(result.data, this.data.own),
            title: result.data.supplierName,
            buttons: this.data.own
              ? []
              : buttonsOf(result.data.actions, [
                  { code: 'allocatePrepaid', secondary: true },
                  { code: 'registerPayment' },
                ]),
            refunds: result.data.refunds.map((refund) => ({
              no: refund.no,
              date: 'date' in refund ? refund.date : refund.refundDate,
              amount: textOfCents(refund.amountCents),
              status: labels.recordStatus[refund.status],
              paymentId: 'paymentId' in refund ? refund.paymentId : null,
            })),
          })
        return result
      },
      rowOf,
    )
  },
  async onShow(this: Host) {
    void this.list?.refresh()
    if (this.data.own) {
      const result = await loadMe()
      if (result.ok) this.id = result.data.supplierId ?? ''
    }
    watch(this, [`ap:${this.id}`], () => {
      void this.list?.refresh()
      if (this.data.paymentLayer) void this.panel?.refresh()
    })
  },
  async onOpen(this: Host, event: KeyEvent) {
    const row = this.data.rows.find((item) => item.id === event.currentTarget.dataset.key)
    if (!row) return
    const id = row.docId
    if (!this.data.own) {
      void wx.navigateTo({
        url: `/packages/finance/pages/payable/index?docType=${row.docType}&id=${id}`,
      })
      return
    }
    this.setData({ sheet: true, view: null, stockView: null, sheetError: '' })
    if (row.docType === 'wh') {
      const result = await request(contract.getSupplierStockIn, { params: { id } })
      if (result.ok) this.setData({ stockView: stockViewOf(result.data) })
      else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
    } else {
      const result = await request(contract.supplierPurchaseOrder, { params: { id } })
      if (result.ok) this.setData({ view: poViewOf(result.data, true) })
      else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
    }
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: false })
  },
  onAction(this: Host, event: CodeEvent) {
    if (this.data.own) return
    const mode = event.currentTarget.dataset.code === 'allocatePrepaid' ? '&mode=allocate' : ''
    void wx.navigateTo({
      url: `/packages/finance/pages/receive/index?kind=payment&supplierId=${this.id}${mode}`,
    })
  },
  onOpenRefund(this: Host, event: KeyEvent) {
    if (!this.data.own && event.currentTarget.dataset.key)
      void this.panel?.open(event.currentTarget.dataset.key)
  },
}
export const apStatementPage = { ...methods, data }
