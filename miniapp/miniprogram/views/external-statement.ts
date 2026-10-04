import {
  contract,
  financeCopy as f,
  financeTexts,
  formatTime,
  type OutputOf,
  type StatementSource,
} from '@huazhong/shared'
import type { KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { request } from '../core/request'
import { failureOf } from '../core/session'
import { watch, unwatchOnLeave } from '../core/live'
import { stockViewOf } from './stock'
import { sourceRowOf, settlementRowsOf } from './statement'
type Detail =
  OutputOf<typeof contract.storeStatementDetail> | OutputOf<typeof contract.supplierStatementDetail>
type SupplierDetail = OutputOf<typeof contract.supplierStatementDetail>
type StoreDetail = OutputOf<typeof contract.storeStatementDetail>
function supplierCells(detail: SupplierDetail) {
  return [
    { label: f.received, amountCents: detail.receivedCents, due: false },
    { label: f.returned, amountCents: detail.returnCents, due: false },
    { label: f.openingDebt, amountCents: detail.openingDebtCents, due: false },
    { label: f.supplierDeducted, amountCents: detail.creditDeductedCents, due: false },
    { label: f.receivable, amountCents: detail.amountCents, due: true },
  ]
}
function storeCells(detail: StoreDetail) {
  return [
    { label: f.shipped, amountCents: detail.shippedCents, due: false },
    { label: f.after, amountCents: detail.afterCents, due: false },
    { label: f.storeAmount, amountCents: detail.storeAmountCents ?? 0, due: true },
  ]
}
function externalInfo(detail: Detail) {
  return {
    title: 'storeName' in detail ? `${detail.partyName} · ${detail.storeName}` : detail.partyName,
    status: detail.status,
    statusKind: 'statementStatus',
    rows: [
      { label: f.no, value: detail.no },
      { label: f.period, value: `${detail.periodFrom} — ${detail.periodTo}` },
      { label: f.statementDate, value: detail.statementDate },
      ...(detail.dueDate ? [{ label: f.dueDate, value: detail.dueDate }] : []),
      ...(detail.settledAt ? [{ label: f.settledDate, value: formatTime(detail.settledAt) }] : []),
    ],
  }
}
function viewOf(detail: Detail) {
  const supplierDetail = 'receivedCents' in detail ? detail : null
  return {
    info: externalInfo(detail),
    cells: 'receivedCents' in detail ? supplierCells(detail) : storeCells(detail),
    groups: detail.groups.map((group) => ({
      title: group.storeName ?? detail.partyName,
      rows: group.sources.map(sourceRowOf),
    })),
    settlements: supplierDetail ? settlementRowsOf(supplierDetail.settlements) : [],
    notice: detail.overdueDays ? f.overdue(detail.overdueDays) : '',
  }
}
interface ExternalStatementHost {
  data: { loaded: boolean; supplier: boolean }
  id: string
  detail: Detail | null
  setData(patch: Record<string, unknown>): void
  load(this: ExternalStatementHost): Promise<void>
}
const data = {
  title: f.statementDetail,
  supplier: false,
  loaded: false,
  failure: null as FailureView | null,
  view: null as ReturnType<typeof viewOf> | null,
  texts: financeTexts,
  sourceSheet: false,
  sourceError: '',
  stockView: null as ReturnType<typeof stockViewOf> | null,
}
async function supplierSource(host: ExternalStatementHost, source: StatementSource) {
  const type = source.parentType ?? source.type,
    id = source.parentId ?? source.id
  if (type === 'po') {
    void wx.navigateTo({ url: `/packages/supplier/pages/po-detail/index?id=${id}` })
    return
  }
  if (type !== 'wh') return
  host.setData({ sourceSheet: true, sourceError: '', stockView: null })
  const result = await request(contract.getSupplierStockIn, { params: { id } })
  if (result.ok) host.setData({ stockView: stockViewOf(result.data) })
  else host.setData({ sourceError: failureOf(result.failure, 'refresh')?.message ?? '' })
}
const methods = {
  ...unwatchOnLeave,
  id: '',
  detail: null as Detail | null,
  onLoad(this: ExternalStatementHost, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    void this.load()
  },
  async load(this: ExternalStatementHost) {
    const supplier = this.data.supplier,
      result = await request(
        supplier ? contract.supplierStatementDetail : contract.storeStatementDetail,
        { params: { id: this.id } },
      )
    if (result.ok) {
      this.detail = result.data
      this.setData({ loaded: true, failure: null, view: viewOf(result.data) })
      watch(
        this,
        [supplier ? `ap:${result.data.partyId}` : `ar:${result.data.partyId}`],
        () => void this.load(),
      )
    } else
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
  },
  onFailureAction(this: ExternalStatementHost) {
    void this.load()
  },
  async onSource(this: ExternalStatementHost, event: KeyEvent) {
    const source = this.detail?.groups
      .flatMap((group) => group.sources)
      .find((item) => `${item.type}:${item.id}` === event.currentTarget.dataset.key)
    if (!source) return
    if (this.data.supplier) {
      await supplierSource(this, source)
      return
    }
    if (source.type === 'order' || source.type === 'after')
      void wx.navigateTo({
        url: `/packages/store/pages/${source.type === 'order' ? 'order' : 'after'}-detail/index?id=${source.id}`,
      })
  },
  onCloseSource(this: ExternalStatementHost) {
    this.setData({ sourceSheet: false })
  },
}
export function externalStatementPage(supplier: boolean) {
  return { ...methods, data: { ...data, supplier } }
}
