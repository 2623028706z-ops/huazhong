import {
  financeCopy as f,
  formatMoney,
  formatTime,
  type ReceiptDetail,
  type PaymentDetail,
} from '@huazhong/shared'
import { canDo, findAction } from '../core/actions'
import { periodTextOf, type FinanceRow, type ListRow } from './statement'
type Fund = PaymentDetail | ReceiptDetail
function voidRows(fund: Fund) {
  if (!fund.voidReason) return []
  return [
    { label: f.voidReason, value: fund.voidReason, wide: true },
    { label: f.voidedBy, value: fund.voidedBy?.name ?? '' },
    { label: f.voidedAt, value: fund.voidedAt ? formatTime(fund.voidedAt) : '', wide: true },
  ]
}
// 信息卡顺序：单号、收款日期、方式、收款金额、优惠金额、多收、优惠原因、登记人、登记时间、备注
function fundRows(fund: Fund) {
  const payment = 'payDate' in fund
  return [
    { label: f.no, value: fund.no },
    {
      label: payment ? f.paymentDate : f.receiptDate,
      value: payment ? fund.payDate : fund.receiptDate,
    },
    { label: f.method, value: fund.methodName },
    { label: payment ? f.paymentAmount : f.receiptAmount, value: formatMoney(fund.amountCents) },
    { label: f.discount, value: formatMoney(fund.discountCents) },
    { label: payment ? f.supplierCredited : f.credited, value: formatMoney(fund.creditCents) },
    { label: f.discountReason, value: fund.discountReason || '—' },
    { label: f.registeredBy, value: fund.createdBy.name },
    { label: f.registeredAt, value: formatTime(fund.createdAt), wide: true },
    { label: f.note, value: fund.note || '—', wide: true },
    ...voidRows(fund),
  ]
}
function linkedRows(fund: Fund): ListRow[] {
  const payment = 'payDate' in fund
  return fund.statements.map((item) => ({
    key: item.id,
    title: `${f.no} ${item.no}`,
    amountLabel: payment ? f.payable : f.receivable,
    amount: formatMoney(item.dueCents),
    notes: [`${f.period} ${periodTextOf(item.periodFrom, item.periodTo)}`],
    tags: [
      { text: f[item.status], warn: item.status === 'unsettled', done: item.status === 'settled' },
    ],
    muted: item.reversedAt !== null,
  }))
}
export function fundViewOf(fund: Fund) {
  const code = 'payDate' in fund ? 'voidPayment' : 'voidReceipt',
    action = findAction(fund.actions, code)
  return {
    title: 'payDate' in fund ? fund.supplierName : fund.customerName,
    // 有效的不标，只有作废才标
    status: fund.status === 'voided' ? 'voided' : '',
    statusKind: 'recordStatus',
    notice: fund.lockedReason ?? '',
    canVoid: canDo(fund.actions, code),
    hasVoid: action !== null,
    voidDisabled: !canDo(fund.actions, code),
    voidReason: action?.disabledReason ?? '',
    rows: fundRows(fund),
    statements: [{ key: '', head: '', meta: '', rows: linkedRows(fund) }].filter(
      (group) => group.rows.length,
    ),
  }
}
// 收付款记录：单号、收款日期、方式、收款金额、对账单
export function recordRowOf(record: ReceiptDetail | PaymentDetail): FinanceRow {
  const payment = 'payDate' in record
  return {
    kind: payment ? 'payment' : 'receipt',
    id: record.id,
    title: payment ? record.supplierName : record.customerName,
    status: record.status,
    fields: [
      { label: f.no, value: record.no },
      {
        label: payment ? f.paymentDate : f.receiptDate,
        value: payment ? record.payDate : record.receiptDate,
      },
      { label: f.method, value: record.methodName },
      {
        label: payment ? f.paymentAmount : f.receiptAmount,
        value: formatMoney(record.amountCents),
        amount: true,
      },
      {
        label: f.statementNo,
        value: record.statements[0]
          ? f.statementSummary(record.statements[0].no, record.statements.length)
          : f.noLinkedStatements,
        wide: true,
      },
    ],
    tags: [],
  }
}
