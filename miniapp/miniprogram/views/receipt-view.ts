import {
  financeCopy as f,
  formatMoney,
  formatTime,
  type ReceiptDetail,
  type PaymentDetail,
} from '@huazhong/shared'
import { canDo, findAction } from '../core/actions'
import type { FinanceRow } from './statement'
type Fund = PaymentDetail | ReceiptDetail
function fundBusinessRows(fund: Fund) {
  const payment = 'payDate' in fund
  return [
    {
      label: payment ? f.supplier : f.customer,
      value: payment ? fund.supplierName : fund.customerName,
    },
    { label: payment ? f.paymentAmount : f.receiptAmount, value: formatMoney(fund.amountCents) },
    { label: f.discount, value: formatMoney(fund.discountCents) },
    { label: f.discountReason, value: fund.discountReason },
    { label: payment ? f.supplierCredited : f.credited, value: formatMoney(fund.creditCents) },
    {
      label: payment ? f.paymentDate : f.receiptDate,
      value: payment ? fund.payDate : fund.receiptDate,
    },
  ]
}
function fundHistoryRows(fund: Fund) {
  return [
    { label: f.method, value: fund.methodName },
    { label: f.note, value: fund.note },
    { label: f.registeredBy, value: fund.createdBy.name },
    { label: f.registeredAt, value: formatTime(fund.createdAt) },
    ...(fund.voidReason
      ? [
          { label: f.voidReason, value: fund.voidReason },
          { label: f.voidedBy, value: fund.voidedBy?.name ?? '' },
          { label: f.voidedAt, value: fund.voidedAt ? formatTime(fund.voidedAt) : '' },
        ]
      : []),
  ]
}
export function fundViewOf(fund: Fund) {
  const code = 'payDate' in fund ? 'voidPayment' : 'voidReceipt',
    action = findAction(fund.actions, code)
  return {
    title: fund.no,
    status: fund.status,
    statusKind: 'recordStatus',
    notice: fund.lockedReason ?? '',
    canVoid: canDo(fund.actions, code),
    hasVoid: action !== null,
    voidDisabled: !canDo(fund.actions, code),
    voidReason: action?.disabledReason ?? '',
    rows: [...fundBusinessRows(fund), ...fundHistoryRows(fund)],
    statements: fund.statements.map((item) => ({
      id: item.id,
      title: item.no,
      status: item.status,
      fields: [
        { label: f.amount, value: formatMoney(item.amountCents), amount: true },
        {
          label: 'payDate' in fund ? f.payable : f.receivable,
          value: formatMoney(item.dueCents),
          amount: true,
        },
      ],
      tags: item.reversedAt ? [{ text: f.voided, warn: false }] : [],
    })),
  }
}
export function recordRowOf(record: ReceiptDetail | PaymentDetail): FinanceRow {
  const payment = 'payDate' in record
  return {
    kind: payment ? 'payment' : 'receipt',
    id: record.id,
    title: payment ? record.supplierName : record.customerName,
    status: record.status,
    fields: [
      { label: f.amount, value: formatMoney(record.amountCents), amount: true },
      { label: f.method, value: record.methodName },
      {
        label: payment ? f.paymentDate : f.receiptDate,
        value: payment ? record.payDate : record.receiptDate,
      },
      { label: f.no, value: record.no, wide: true },
      {
        label: f.statements,
        value: record.statements[0]
          ? f.statementSummary(record.statements[0].no, record.statements.length)
          : f.noLinkedStatements,
        wide: true,
      },
    ],
    tags: record.discountCents
      ? [{ text: `${f.discount} ${formatMoney(record.discountCents)}`, warn: false }]
      : [],
  }
}
