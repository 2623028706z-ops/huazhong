import {
  contract,
  copy,
  financeCopy as f,
  financeTexts,
  formatMoney,
  type PartyLedger,
} from '@huazhong/shared'
import { canDo, type ButtonView } from '../core/actions'
import type { CodeEvent, DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import type { PagedList } from '../core/list'
import { request } from '../core/request'
import { listHandlers, listOf, showList } from './list'
import { refundData, refundHandlers, refundRowsOf } from './party-ledger-refund'
import { statementRowOf, sourceRowOf, sourceRoute, type FinanceRow } from './statement'
const data = {
  supplier: false,
  title: copy.screen.title.arCustomers as string,
  partyName: '',
  statusKind: 'statementStatus',
  ledgerTab: 'statements',
  ledgerTabs: [
    { key: 'statements', text: f.statements },
    { key: 'unstatemented', text: f.unstatemented },
  ],
  rows: [] as FinanceRow[],
  sourceGroups: [] as { title: string; rows: FinanceRow[] }[],
  summary: {
    label: '',
    amountCents: 0,
    lines: [] as { key: string; text: string }[],
  },
  buttons: [] as ButtonView[],
  canRefund: false,
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: f.statements as string,
  allLoaded: copy.state.allLoaded,
  ...refundData,
  texts: financeTexts,
}
interface Host {
  data: typeof data
  id: string
  ledger: PartyLedger | null
  list: PagedList<FinanceRow> | null
  refundKey: string
  setData(patch: Record<string, unknown>): void
}
function groupsOf(sources: PartyLedger['sources'], supplier: boolean) {
  const groups = new Map<string, { title: string; rows: FinanceRow[] }>()
  for (const source of sources) {
    const key = source.storeId ?? ''
    if (!groups.has(key))
      groups.set(key, { title: supplier ? '' : (source.storeName ?? ''), rows: [] })
    groups.get(key)?.rows.push(sourceRowOf(source, supplier))
  }
  return [...groups.values()]
}
// 底栏最多 2 个（2026-10-06 第 4 批，同详情页）：登记收款（付款）是主按钮放最右；
// 次按钮按新建对账单、往来设置、多收退回排，放不下的收进左边「更多」
function ledgerButtonsOf(ledger: PartyLedger, supplier: boolean): ButtonView[] {
  const view = (code: string, text: string, kind: ButtonView['kind']): ButtonView => ({
    code,
    text,
    kind,
    disabled: false,
    reason: '',
  })
  const registerCode = supplier ? 'registerPayment' : 'registerReceipt'
  const secondary = [
    canDo(ledger.actions, 'createStatement') &&
      view('createStatement', f.statementCreate, 'secondary'),
    canDo(ledger.actions, 'editTerms') && view('editTerms', f.terms, 'secondary'),
    canDo(ledger.actions, 'refundCredit') &&
      view('refundCredit', supplier ? f.refundSupplierCredit : f.refundCredit, 'secondary'),
  ].filter((item): item is ButtonView => item !== false)
  const register = canDo(ledger.actions, registerCode)
    ? [view(registerCode, supplier ? f.registerPayment : f.registerReceipt, 'primary')]
    : []
  const inBar = secondary.length + register.length > 2 ? 2 - register.length : secondary.length
  return [...secondary.slice(0, inBar), ...register, ...secondary.slice(inBar)]
}
function applyLedger(host: Host, ledger: PartyLedger) {
  host.ledger = ledger
  const supplier = host.data.supplier
  host.setData({
    partyName: ledger.partyName,
    summary: {
      label: supplier ? f.payableOutstanding : f.outstanding,
      amountCents: ledger.outstandingCents,
      lines: [
        {
          key: 'credit',
          text: [
            `${f.unsettled} ${formatMoney(ledger.unsettledCents)}`,
            `${f.unstatemented} ${formatMoney(ledger.unstatementedCents)}`,
            `${supplier ? f.supplierCredited : f.credited} ${formatMoney(ledger.creditCents)}`,
          ].join(f.gap),
        },
        {
          key: 'terms',
          text: [
            `${f.termDays} ${ledger.termDays === null ? f.notSet : `${ledger.termDays} ${f.days}`}`,
            `${f.openingDebt} ${formatMoney(ledger.openingDebtCents)}`,
          ].join(f.gap),
        },
      ],
    },
    buttons: ledgerButtonsOf(ledger, supplier),
    canRefund: canDo(ledger.actions, 'refundCredit'),
    sourceGroups: groupsOf(ledger.sources, supplier),
    refundRows: refundRowsOf(ledger),
  })
}
async function fetchLedger(host: Host, cursor: string | undefined) {
  const result = await request(
    host.data.supplier ? contract.getFinanceSupplier : contract.getArCustomer,
    {
      params: { id: host.id },
      query: {
        tab: host.data.ledgerTab as 'statements' | 'unstatemented',
        cursor,
      },
    },
  )
  if (!result.ok) return result
  applyLedger(host, result.data)
  return {
    ...result,
    data: {
      ...result.data,
      items:
        host.data.ledgerTab === 'statements'
          ? result.data.items.map((item) => statementRowOf(item))
          : [],
    },
  }
}
type LedgerPage = Host & Record<'onCreate' | 'onRegister' | 'onTerms' | 'onRefund', () => unknown>
// 底栏见 ledgerButtonsOf（往来设置、多收退回 2026-10-06 第 4 批从汇总卡挪到底栏）
export const partyLedgerPage = {
  ...listHandlers,
  ...refundHandlers,
  data,
  id: '',
  ledger: null as PartyLedger | null,
  list: null as PagedList<FinanceRow> | null,
  refundKey: '',
  onLoad(this: Host, query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.list = listOf<FinanceRow>(
      this,
      (cursor) => fetchLedger(this, cursor),
      (row) => row,
    )
  },
  onShow(this: Host) {
    showList(this, [this.data.supplier ? `ap:${this.id}` : `ar:${this.id}`])
  },
  onLedgerTab(this: Host, event: DetailEvent<string>) {
    this.setData({
      ledgerTab: event.detail,
      emptyObject: event.detail === 'statements' ? f.statements : f.unstatementedSources,
      rows: [],
    })
    void this.list?.refresh()
  },
  onOpen(this: Host, event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/finance/pages/statement-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
  onSource(this: Host, event: KeyEvent) {
    const source = this.ledger?.sources.find(
      (item) => `${item.type}:${item.id}` === event.currentTarget.dataset.key,
    )
    if (source) void wx.navigateTo({ url: sourceRoute(source) })
  },
  onAction(this: LedgerPage, event: CodeEvent) {
    const handlers: Record<string, (() => unknown) | undefined> = {
      createStatement: this.onCreate,
      registerPayment: this.onRegister,
      registerReceipt: this.onRegister,
      editTerms: this.onTerms,
      refundCredit: this.onRefund,
    }
    void handlers[event.currentTarget.dataset.code]?.call(this)
  },
  onCreate(this: Host) {
    void wx.navigateTo({
      url: `/packages/finance/pages/statement-form/index?kind=${this.data.supplier ? 'supplier' : 'customer'}&partyId=${this.id}`,
    })
  },
  onRegister(this: Host) {
    void wx.navigateTo({
      url: `/packages/finance/pages/receive/index?kind=${this.data.supplier ? 'payment' : 'receipt'}&${this.data.supplier ? 'supplierId' : 'customerId'}=${this.id}`,
    })
  },
  onTerms(this: Host) {
    void wx.navigateTo({
      url: `/packages/finance/pages/account-settings/index?kind=${this.data.supplier ? 'supplier' : 'customer'}&partyId=${this.id}&name=${encodeURIComponent(this.data.title)}`,
    })
  },
}
