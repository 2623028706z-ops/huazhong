// 收款详情（06 章 F3、F8 同一个弹层）：金额、方式、日期、备注、状态、核销明细；作废后写「已作废，核销已撤回。」
import {
  copy,
  formatMoney,
  formatTime,
  labels,
  type Allocation,
  type ReceiptCard,
  type ReceiptDetail,
  type RefundDetail,
  type PaymentDetail,
  type PaymentAllocation,
} from '@huazhong/shared'
import { canDo } from '../core/actions'
import { rowsOf } from './order'

// 核销记录一行：收款号或单号 · 类型 · 时间 + 金额
export function allocRowsOf(allocations: readonly Allocation[], by: 'receipt' | 'order') {
  return allocations.map((alloc) => ({
    id: alloc.id,
    key: by === 'receipt' ? alloc.receiptId : alloc.orderId,
    name: [by === 'receipt' ? alloc.receiptNo : alloc.orderNo, labels.allocKind[alloc.kind]].join(
      copy.separator,
    ),
    sub: historyTextOf(alloc),
    amount: copy.rework.allocationAmounts(alloc.registeredCents, alloc.effectiveCents),
    canRevoke: canDo(alloc.actions, 'revokeAllocation'),
  }))
}

function historyTextOf(alloc: Allocation | PaymentAllocation) {
  return [
    labels.allocationStatus[alloc.status],
    alloc.createdBy.name,
    formatTime(alloc.createdAt),
    alloc.revokeReason,
    alloc.revokedBy?.name,
    alloc.revokedAt ? formatTime(alloc.revokedAt) : null,
  ]
    .filter(Boolean)
    .join(copy.separator)
}

export function paymentAllocRowsOf(allocations: readonly PaymentAllocation[]) {
  return allocations.map((alloc) => ({
    id: alloc.id,
    key: alloc.paymentId,
    name: [alloc.paymentNo, alloc.docNo, labels.allocKind[alloc.kind]].join(copy.separator),
    sub: historyTextOf(alloc),
    amount: copy.rework.allocationAmounts(alloc.registeredCents, alloc.effectiveCents),
    canRevoke: canDo(alloc.actions, 'revokePaymentAllocation'),
  }))
}

function refundViewsOf(refunds: RefundDetail[]) {
  return refunds.map((refund) => ({
    id: refund.id,
    no: refund.no,
    date: refund.refundDate,
    amount: formatMoney(refund.amountCents),
    status: labels.recordStatus[refund.status],
    meta: [
      refund.methodName,
      refund.note,
      refund.voidReason,
      refund.voidedBy?.name,
      refund.voidedAt ? formatTime(refund.voidedAt) : null,
    ]
      .filter(Boolean)
      .join(copy.separator),
    canVoid: canDo(refund.actions, 'voidRefund'),
  }))
}
function fundRowsOf(fund: PaymentDetail | ReceiptDetail) {
  const payment = 'payDate' in fund
  return rowsOf([
    [
      payment ? copy.screen.label.supplier : copy.screen.label.customer,
      payment ? fund.supplierName : fund.customerName,
    ],
    [copy.screen.label.amount, formatMoney(fund.amountCents)],
    [copy.screen.label.methodShort, fund.methodName],
    [copy.screen.label.date, payment ? fund.payDate : fund.receiptDate],
    [
      payment ? copy.rework.availablePrepaid : copy.rework.availableReceiptPrepaid,
      formatMoney(fund.prepaidCents),
    ],
    [copy.field.note, fund.note],
    [copy.screen.label.voidReason, fund.voidReason],
    [copy.screen.label.voidedAt, fund.voidedAt ? formatTime(fund.voidedAt) : null],
    [copy.rework.voidedBy, fund.voidedBy?.name ?? null],
  ])
}
export function fundViewOf(fund: PaymentDetail | ReceiptDetail) {
  const payment = 'payDate' in fund
  return {
    title: fund.no,
    statusKind: 'recordStatus',
    status: fund.status,
    notice: fund.notice ?? '',
    canVoid: canDo(fund.actions, payment ? 'voidPayment' : 'voidReceipt'),
    canRefund: canDo(fund.actions, payment ? 'refundPayment' : 'refundReceipt'),
    allocations: payment
      ? paymentAllocRowsOf(fund.allocations)
      : allocRowsOf(fund.allocations, 'order'),
    refunds: refundViewsOf(fund.refunds),
    rows: fundRowsOf(fund),
  }
}

// 收付款记录卡片：日期 + 状态；客户 + 方式；单号 + 金额
function receiptRowOf(receipt: ReceiptCard) {
  return {
    id: receipt.id,
    date: receipt.receiptDate,
    status: receipt.status,
    title: receipt.customerName,
    total: receipt.methodName,
    meta: receipt.no,
    amount: receipt.amountCents,
    amountText: '',
    tags: [],
  }
}

export function recordRowOf(record: ReceiptCard | PaymentDetail) {
  if ('receiptDate' in record) return { ...receiptRowOf(record), kind: 'receipt' as const }
  return {
    kind: 'payment' as const,
    id: record.id,
    date: record.payDate,
    status: record.status,
    title: record.supplierName,
    total: record.methodName,
    meta: record.no,
    amount: record.amountCents,
    amountText: '',
    tags: [],
  }
}
