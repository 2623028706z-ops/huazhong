import type { contract } from '@huazhong/shared'
import {
  financeCopy as f,
  formatMoney,
  formatTime,
  copy,
  type StatementCard,
  type StatementSource,
  type StatementDetail,
  type PartyLedger,
  type OutputOf,
} from '@huazhong/shared'
export interface FinanceRow {
  id: string
  title: string
  status: string
  fields: { label: string; value: string; amount?: boolean; wide?: boolean }[]
  tags: { text: string; warn: boolean; danger?: boolean }[]
  kind?: 'receipt' | 'payment'
  source?: StatementSource
}
type ExternalCard = OutputOf<typeof contract.storeStatements>['items'][number]
function cardAmountOf(card: StatementCard | ExternalCard, external: 'store' | 'supplier' | null) {
  if (external === 'store' && 'storeAmountCents' in card)
    return { label: f.storeAmount, value: formatMoney(card.storeAmountCents ?? 0), amount: true }
  return {
    label: external === 'supplier' || card.kind === 'customer' ? f.receivable : f.payable,
    value: formatMoney(card.amountCents),
    amount: true,
  }
}
export function statementRowOf(
  card: StatementCard | ExternalCard,
  external: 'store' | 'supplier' | null = null,
): FinanceRow {
  const fields: FinanceRow['fields'] = [
    { label: f.no, value: card.no, wide: true },
    { label: f.statementDate, value: card.statementDate },
    ...(card.dueDate ? [{ label: f.dueDate, value: card.dueDate }] : []),
    { label: f.period, value: `${card.periodFrom} — ${card.periodTo}`, wide: true },
    {
      label:
        card.kind === 'supplier' ? copy.screen.title.purchaseOrders : copy.screen.title.shipList,
      value: String(card.sourceCount),
    },
    cardAmountOf(card, external),
  ]
  if (card.status === 'settled' && card.settledAt)
    fields.push({ label: f.settledDate, value: formatTime(card.settledAt).split(' ')[0] ?? '' })
  return {
    id: card.id,
    title: f.statement,
    status: card.status,
    fields,
    tags: card.overdueDays
      ? [{ text: f.overdue(card.overdueDays), warn: false, danger: true }]
      : [],
  }
}
export function sourceRowOf(source: StatementSource): FinanceRow {
  const labels = {
    order: f.shipDate,
    after: f.afterDate,
    po: f.receiveDate,
    wh: f.stockInDate,
    purchase_return: f.afterDate,
    price_change: f.afterDate,
  }
  return {
    id: `${source.type}:${source.id}`,
    title: source.storeName ?? source.sourceNo,
    status: '',
    source,
    fields: [
      { label: f.no, value: source.sourceNo, wide: true },
      { label: labels[source.type], value: source.sourceDate },
      { label: f.amount, value: formatMoney(source.amountCents), amount: true },
    ],
    tags: source.previousPeriod ? [{ text: f.previousPeriod, warn: true }] : [],
  }
}
export function sourceRoute(
  source: StatementSource,
  scope: 'finance' | 'internal' = 'finance',
): string {
  const type = source.parentType ?? source.type,
    id = source.parentId ?? source.id
  const page = {
    order: 'sales/pages/order-detail',
    after: 'sales/pages/after-detail',
    po: 'purchase/pages/order-detail',
    wh: 'warehouse/pages/doc-detail',
    purchase_return: 'purchase/pages/order-detail',
    price_change: 'purchase/pages/order-detail',
  }[type]
  return `/packages/${page}/index?scope=${scope}&sourceType=${source.parentType ?? source.type}&id=${id}`
}
type Party = Pick<
  PartyLedger,
  | 'partyId'
  | 'partyName'
  | 'enabled'
  | 'kind'
  | 'outstandingCents'
  | 'unsettledCount'
  | 'unstatementedCents'
  | 'creditCents'
  | 'lastStatementTo'
  | 'lastFundDate'
  | 'overdueDays'
  | 'overdueCents'
>
function partyFieldsOf(party: Party): FinanceRow['fields'] {
  const supplier = party.kind === 'supplier'
  return [
    {
      label: supplier ? f.payableOutstanding : f.outstanding,
      value: formatMoney(party.outstandingCents),
      amount: true,
    },
    { label: f.unstatemented, value: formatMoney(party.unstatementedCents), amount: true },
    {
      label: f.unsettled,
      value: f.unsettledCount(party.unsettledCount).replace(f.unsettled, '').trim(),
    },
    { label: f.lastStatementTo, value: party.lastStatementTo ?? f.neverStatemented },
    {
      label: supplier ? f.lastPaymentDate : f.lastReceiptDate,
      value: party.lastFundDate ?? (supplier ? f.noPayment : f.noReceipt),
    },
    ...(party.creditCents
      ? [
          {
            label: supplier ? f.supplierCredited : f.credited,
            value: formatMoney(party.creditCents),
            amount: true,
          },
        ]
      : []),
  ]
}
export function partyRowOf(party: Party): FinanceRow {
  return {
    id: party.partyId,
    title: party.partyName,
    status: '',
    fields: partyFieldsOf(party),
    tags: [
      ...(!party.enabled ? [{ text: copy.tag.disabled, warn: false }] : []),
      ...(party.overdueDays
        ? [
            {
              text: f.overdueAmount(formatMoney(party.overdueCents)),
              warn: false,
              danger: true,
            },
          ]
        : []),
    ],
  }
}
export function statementAmountRows(detail: StatementDetail) {
  const supplier = detail.kind === 'supplier'
  return [
    {
      label: supplier ? f.received : f.shipped,
      value: formatMoney(supplier ? detail.receivedCents : detail.shippedCents),
    },
    {
      label: supplier ? f.returned : f.after,
      value: formatMoney(supplier ? detail.returnCents : detail.afterCents),
    },
    { label: f.openingDebt, value: formatMoney(detail.openingDebtCents) },
    {
      label: supplier ? f.supplierDeducted : f.deducted,
      value: formatMoney(detail.creditDeductedCents),
    },
    { label: supplier ? f.payable : f.receivable, value: formatMoney(detail.amountCents) },
  ]
}
export function statementInfoOf(detail: StatementDetail) {
  return [
    { label: f.no, value: detail.no },
    { label: detail.kind === 'supplier' ? f.supplier : f.customer, value: detail.partyName },
    { label: f.period, value: `${detail.periodFrom} — ${detail.periodTo}` },
    { label: f.statementDate, value: detail.statementDate },
    ...(detail.dueDate ? [{ label: f.dueDate, value: detail.dueDate }] : []),
    { label: f.createdBy, value: detail.createdBy.name },
    { label: f.note, value: detail.note },
    ...(detail.voidReason
      ? [
          { label: f.voidReason, value: detail.voidReason },
          { label: f.voidedBy, value: detail.voidedBy?.name ?? '' },
          { label: f.voidedAt, value: detail.voidedAt ? formatTime(detail.voidedAt) : '' },
        ]
      : []),
  ]
}
export function settlementRowsOf(items: StatementDetail['settlements']): FinanceRow[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.no,
    status: item.status,
    fields: [
      { label: f.amount, value: formatMoney(item.amountCents), amount: true },
      { label: f.method, value: item.methodName },
      { label: f.registeredAt, value: item.date },
    ],
    tags: item.reversedAt ? [{ text: f.voided, warn: false }] : [],
  }))
}
