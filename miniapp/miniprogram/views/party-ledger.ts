import {
  contract,
  copy,
  financeCopy as f,
  financeTexts,
  formatMoney,
  labels,
  shanghaiDateOf,
  type PartyLedger,
} from '@huazhong/shared'
import { canDo } from '../core/actions'
import type { DetailEvent, KeyEvent } from '../core/events'
import type { FailureView } from '../core/failure-view'
import { emptyFilter } from '../core/filter'
import type { PagedList } from '../core/list'
import { checkedOf } from '../core/form'
import { centsOfText } from '../core/money'
import { newIdempotencyKey, request } from '../core/request'
import { failureOf, messageOf } from '../core/session'
import { showSuccess } from '../core/toast'
import { listHandlers, listOf, listQueryOf, showList } from './list'
import { statementRowOf, sourceRowOf, sourceRoute, type FinanceRow } from './statement'
const data = {
  supplier: false,
  title: f.customer as string,
  statusKind: 'statementStatus',
  statuses: ['unsettled', 'settled', 'voided'],
  counts: {},
  filter: emptyFilter,
  ledgerTab: 'statements',
  ledgerTabs: [
    { key: 'statements', text: f.statements },
    { key: 'unstatemented', text: f.unstatemented },
  ],
  rows: [] as FinanceRow[],
  sourceGroups: [] as { title: string; rows: FinanceRow[] }[],
  cells: [] as { label: string; amountCents: number; due: boolean }[],
  creditText: '',
  termsText: '',
  canCreate: false,
  canRegister: false,
  canRefund: false,
  canTerms: false,
  loaded: false,
  skeleton: false,
  done: false,
  failure: null as FailureView | null,
  emptyObject: f.noStatements as string,
  allLoaded: copy.state.allLoaded,
  refundSheet: false,
  refundChanged: false,
  refundError: '',
  refundBusy: false,
  today: shanghaiDateOf(Date.now()),
  refundForm: { refundDate: shanghaiDateOf(Date.now()), amountText: '', methodName: '', note: '' },
  refundMethods: [] as { id: string; name: string }[],
  refundRows: [] as {
    id: string
    no: string
    date: string
    amount: string
    status: string
    reason: string
    canVoid: boolean
  }[],
  voidRefundId: '',
  voidRefundReason: '',
  texts: financeTexts,
}
interface Host {
  data: typeof data
  id: string
  ledger: PartyLedger | null
  list: PagedList<FinanceRow> | null
  refundKey: string
  setData(patch: Record<string, unknown>): void
  openRefund(): Promise<void>
}
function groupsOf(sources: PartyLedger['sources']) {
  const groups = new Map<string, { title: string; rows: FinanceRow[] }>()
  for (const source of sources) {
    const key = source.storeId ?? ''
    if (!groups.has(key)) groups.set(key, { title: source.storeName ?? f.supplier, rows: [] })
    groups.get(key)?.rows.push(sourceRowOf(source))
  }
  return [...groups.values()]
}
function ledgerCells(ledger: PartyLedger, supplier: boolean) {
  return [
    {
      label: supplier ? f.payableOutstanding : f.outstanding,
      amountCents: ledger.outstandingCents,
      due: true,
    },
    { label: f.unsettled, amountCents: ledger.unsettledCents, due: false },
    { label: f.unstatemented, amountCents: ledger.unstatementedCents, due: false },
  ]
}
function refundRows(ledger: PartyLedger) {
  return ledger.refunds.map((item) => ({
    id: item.id,
    no: item.no,
    date: item.refundDate,
    amount: formatMoney(item.amountCents),
    status: labels.recordStatus[item.status],
    reason: item.voidReason ?? '',
    canVoid: canDo(item.actions, 'voidRefund'),
  }))
}
function applyLedger(host: Host, ledger: PartyLedger) {
  host.ledger = ledger
  const supplier = host.data.supplier
  host.setData({
    title: ledger.partyName,
    counts: ledger.counts,
    cells: ledgerCells(ledger, supplier),
    creditText: formatMoney(ledger.creditCents),
    termsText: [
      `${f.termDays} ${ledger.termDays === null ? f.notSet : `${ledger.termDays}${f.days}`}`,
      `${f.openingDebt} ${formatMoney(ledger.openingDebtCents)}`,
    ].join(copy.separator),
    canCreate: canDo(ledger.actions, 'createStatement'),
    canRegister: canDo(ledger.actions, supplier ? 'registerPayment' : 'registerReceipt'),
    canRefund: canDo(ledger.actions, 'refundCredit'),
    canTerms: canDo(ledger.actions, 'editTerms'),
    sourceGroups: groupsOf(ledger.sources),
    refundRows: refundRows(ledger),
  })
}
async function fetchLedger(host: Host, cursor: string | undefined) {
  const { status, from, to } = listQueryOf<'unsettled' | 'settled' | 'voided'>(host.data.filter)
  const result = await request(
    host.data.supplier ? contract.getFinanceSupplier : contract.getArCustomer,
    {
      params: { id: host.id },
      query: {
        tab: host.data.ledgerTab as 'statements' | 'unstatemented',
        status,
        from,
        to,
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
function checkedRefund(host: Host) {
  const form = host.data.refundForm,
    amount = centsOfText(form.amountText)
  return checkedOf(
    contract.createRefund.body.safeParse({
      kind: host.data.supplier ? 'payment' : 'receipt',
      ...(host.data.supplier ? { supplierId: host.id } : { customerId: host.id }),
      refundDate: form.refundDate,
      amountCents: amount,
      methodName: form.methodName,
      note: form.note,
    }),
  )
}
function refundProblem(host: Host) {
  if (host.data.refundForm.refundDate > host.data.today) return copy.rework.refundDateFuture
  const amount = centsOfText(host.data.refundForm.amountText)
  return amount === null || amount > (host.ledger?.creditCents ?? 0)
    ? f.maxRefund(formatMoney(host.ledger?.creditCents ?? 0))
    : ''
}
export const partyLedgerPage = {
  ...listHandlers,
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
      statusKind: event.detail === 'statements' ? 'statementStatus' : '',
      emptyObject: event.detail === 'statements' ? f.noStatements : f.noUnstatemented,
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
  async onRefund(this: Host) {
    await this.openRefund()
  },
  async openRefund(this: Host) {
    if (!this.data.canRefund) return
    this.refundKey = newIdempotencyKey()
    this.setData({
      refundSheet: true,
      refundChanged: false,
      refundError: '',
      refundForm: { refundDate: this.data.today, amountText: '', methodName: '', note: '' },
    })
    const result = await request(contract.listMethods)
    if (result.ok)
      this.setData({
        refundMethods: result.data.items
          .filter((item) => item.enabled)
          .map((item) => ({ id: item.name, name: item.name })),
      })
    else this.setData({ refundError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseRefund(this: Host) {
    if (this.data.refundBusy) return
    this.setData({ refundSheet: false, refundChanged: false, refundError: '' })
  },
  onRefundField(this: Host, event: DetailEvent<string, { key: string }>) {
    const form = { ...this.data.refundForm, [event.currentTarget.dataset.key]: event.detail }
    this.setData({
      refundForm: form,
      refundChanged:
        form.refundDate !== this.data.today ||
        Boolean(form.amountText || form.methodName || form.note),
      refundError: '',
    })
  },
  async onSubmitRefund(this: Host) {
    if (this.data.refundBusy || !this.ledger) return
    const problem = refundProblem(this)
    if (problem) {
      this.setData({ refundError: problem })
      return
    }
    const checked = checkedRefund(this)
    if (!checked.ok) {
      this.setData({ refundError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    this.setData({ refundBusy: true })
    const result = await request(
      contract.createRefund,
      { body: checked.body },
      { idempotencyKey: this.refundKey },
    )
    this.setData({ refundBusy: false })
    if (result.ok) {
      this.setData({ refundSheet: false, refundChanged: false })
      void this.list?.refresh()
      showSuccess(copy.action.saved)
    } else this.setData({ refundError: failureOf(result.failure, 'submit')?.message ?? '' })
  },
  onVoidRefund(this: Host, event: KeyEvent) {
    this.setData({
      voidRefundId: event.currentTarget.dataset.key,
      voidRefundReason: '',
      refundError: '',
    })
  },
  onCloseVoidRefund(this: Host) {
    this.setData({ voidRefundId: '' })
  },
  async onSubmitVoidRefund(this: Host, event: DetailEvent<string>) {
    const refund = this.ledger?.refunds.find((item) => item.id === this.data.voidRefundId)
    if (!refund || !canDo(refund.actions, 'voidRefund')) return
    this.setData({ refundBusy: true })
    const result = await request(contract.voidRefund, {
      params: { id: refund.id },
      body: { version: refund.version, reason: event.detail },
    })
    this.setData({ refundBusy: false })
    if (result.ok) {
      this.setData({ voidRefundId: '' })
      void this.list?.refresh()
    } else {
      const view = failureOf(result.failure, 'submit')
      this.setData({ refundError: view ? messageOf(view) : '' })
      if (view?.kind === 'stale') void this.list?.refresh()
    }
  },
}
