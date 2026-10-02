import { contract, copy, apStatuses, type ApCard, type OutputOf } from '@huazhong/shared'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter } from '../core/filter'
import type { PagedList } from '../core/list'
import { watch } from '../core/live'
import { request } from '../core/request'
import { failureOf, loadMe } from '../core/session'
import { listHandlers, listOf, listQueryOf } from './list'
import { poRowOf, poViewOf } from './purchase'

function rowOf(ap: ApCard) {
  return { ...poRowOf(ap), status: ap.apStatus, amount: ap.payableCents }
}
function cellsOf(ap: OutputOf<typeof contract.getFinanceSupplier>) {
  return [
    { label: copy.screen.label.payable, amountCents: ap.payableCents, due: false },
    { label: copy.screen.label.paid, amountCents: ap.paidCents, due: false },
    { label: copy.screen.label.due, amountCents: ap.unpaidCents, due: true },
  ]
}
const data = {
  own: false,
  title: copy.screen.title.apSupplier as string,
  statusKind: 'apStatus',
  statuses: [...apStatuses],
  counts: {},
  filter: emptyFilter,
  dateLabel: copy.screen.label.orderDate,
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
}
interface Host {
  data: typeof data
  id: string
  list: PagedList<ApCard> | null
  setData(patch: Record<string, unknown>): void
}
const methods = {
  ...listHandlers,
  id: '',
  list: null as PagedList<ApCard> | null,
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
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
            cells: cellsOf(result.data),
            title: result.data.supplierName,
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
    watch(this, [`ap:${this.id}`], () => void this.list?.refresh())
  },
  async onOpen(this: Host, event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (!this.data.own) {
      void wx.navigateTo({ url: `/packages/finance/pages/payable/index?docType=po&id=${id}` })
      return
    }
    this.setData({ sheet: true, view: null, sheetError: '' })
    const result = await request(contract.supplierPurchaseOrder, { params: { id } })
    if (result.ok) this.setData({ view: poViewOf(result.data, true) })
    else this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseSheet(this: Host) {
    this.setData({ sheet: false })
  },
}
export const apStatementPage = { ...methods, data }
