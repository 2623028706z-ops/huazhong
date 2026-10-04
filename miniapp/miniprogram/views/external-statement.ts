import {
  contract,
  financeCopy as f,
  financeTexts,
  shanghaiDayOf,
  type OutputOf,
  type StatementSource,
} from '@huazhong/shared'
import type { DetailEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { request } from '../core/request'
import { failureOf } from '../core/session'
import { watch, unwatchOnLeave } from '../core/live'
import { stockViewOf } from './stock'
import { periodTextOf, settlementListRowsOf, statementSectionsOf } from './statement'
type Detail =
  OutputOf<typeof contract.storeStatementDetail> | OutputOf<typeof contract.supplierStatementDetail>
type SupplierDetail = OutputOf<typeof contract.supplierStatementDetail>
type StoreDetail = OutputOf<typeof contract.storeStatementDetail>
function supplierCells(detail: SupplierDetail) {
  const cell = (label: string, amountCents: number, due = false) => ({ label, amountCents, due })
  return [
    cell(f.received, detail.receivedCents),
    cell(f.returned, detail.returnCents),
    ...(detail.openingDebtCents ? [cell(f.openingDebt, detail.openingDebtCents)] : []),
    cell(f.supplierDeducted, detail.creditDeductedCents),
    cell(f.receivable, detail.amountCents, true),
  ]
}
function storeCells(detail: StoreDetail) {
  return [
    { label: f.shipped, amountCents: detail.shippedCents, due: false },
    { label: f.after, amountCents: detail.afterCents, due: false },
    { label: f.storeAmount, amountCents: detail.storeAmountCents ?? 0, due: true },
  ]
}
// 信息卡：单号、开单日期、付款截止、对账期间（已结清多一项结清日期）
function externalInfo(detail: Detail) {
  return {
    title: 'storeName' in detail ? `${detail.partyName} · ${detail.storeName}` : detail.partyName,
    status: detail.status,
    statusKind: 'statementStatus',
    rows: [
      { label: f.no, value: detail.no },
      { label: f.statementDate, value: detail.statementDate },
      ...(detail.dueDate ? [{ label: f.dueDate, value: detail.dueDate }] : []),
      { label: f.period, value: periodTextOf(detail.periodFrom, detail.periodTo), wide: true },
      ...(detail.settledAt
        ? [{ label: f.settledDate, value: shanghaiDayOf(detail.settledAt) }]
        : []),
    ],
  }
}
function viewOf(detail: Detail) {
  const supplierDetail = 'receivedCents' in detail ? detail : null
  const sections = statementSectionsOf(
    detail.groups.flatMap((group) => group.sources),
    { supplier: supplierDetail !== null, heads: false },
  )
  return {
    info: externalInfo(detail),
    cells: supplierDetail ? supplierCells(supplierDetail) : storeCells(detail as StoreDetail),
    main: sections.main,
    afterSection: sections.after,
    receiptSection: supplierDetail
      ? {
          title: f.receipts,
          meta: '',
          emptyText: f.noReceipt,
          groups: supplierDetail.settlements.length
            ? [
                {
                  key: '',
                  head: '',
                  meta: '',
                  rows: settlementListRowsOf(supplierDetail.settlements, false),
                },
              ]
            : [],
        }
      : null,
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
  async onSource(this: ExternalStatementHost, event: DetailEvent<string>) {
    const source = this.detail?.groups
      .flatMap((group) => group.sources)
      .find((item) => `${item.type}:${item.id}` === event.detail)
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
