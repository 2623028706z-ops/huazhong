// 收款详情（06 章 F3、F8 同一个弹层）：金额、方式、日期、备注、状态、核销明细；作废后写「已作废，核销已撤回。」
import {
  copy,
  formatMoney,
  formatTime,
  labels,
  type Allocation,
  type ReceiptCard,
  type ReceiptDetail,
} from '@huazhong/shared'
import { findAction } from '../../core/actions'
import { rowsOf } from '../../views/order'

// 核销记录一行：收款号或单号 · 类型 · 时间 + 金额
export function allocRowsOf(allocations: readonly Allocation[], by: 'receipt' | 'order') {
  return allocations.map((alloc) => ({
    id: alloc.id,
    key: by === 'receipt' ? alloc.receiptId : alloc.orderId,
    name: [by === 'receipt' ? alloc.receiptNo : alloc.orderNo, labels.allocKind[alloc.kind]].join(
      copy.separator,
    ),
    sub: formatTime(alloc.createdAt),
    amount: formatMoney(alloc.amountCents),
  }))
}

export function receiptViewOf(receipt: ReceiptDetail) {
  const action = findAction(receipt.actions, 'voidReceipt')
  return {
    info: {
      title: receipt.no,
      statusKind: 'recordStatus',
      status: receipt.status,
      rows: rowsOf([
        [copy.screen.label.customer, receipt.customerName],
        [copy.screen.label.amount, formatMoney(receipt.amountCents)],
        [copy.screen.label.methodShort, receipt.methodName],
        [copy.screen.label.date, receipt.receiptDate],
        [copy.field.note, receipt.note],
        [copy.screen.label.voidReason, receipt.voidReason],
        [
          copy.screen.label.voidedAt,
          receipt.voidedAt === null ? null : formatTime(receipt.voidedAt),
        ],
      ]),
    },
    allocs: allocRowsOf(receipt.allocations, 'order'),
    notice: receipt.notice ?? '',
    canVoid: action?.enabled === true,
    voidRequired: action?.reasonRequired === true,
  }
}

// 收付款记录卡片：日期 + 状态；客户 + 方式；单号 + 金额
export function receiptRowOf(receipt: ReceiptCard) {
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
