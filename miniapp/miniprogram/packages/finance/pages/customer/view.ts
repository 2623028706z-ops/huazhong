// F3 客户对账详情的显示：对账格、发货单弹层、售后详情弹层（06 章 F3）
import { copy, formatMoney, labels, type AfterDetail, type ArOrder } from '@huazhong/shared'
import { findAction } from '../../../../core/actions'
import { afterInfoOf, afterLinesOf, afterReasonsOf, afterRowOf } from '../../../../views/after'
import { rowsOf } from '../../../../views/order'
import { allocRowsOf } from '../../receipt-view'

interface Summary {
  shippedCents: number
  afterCents: number
  receivedCents: number
  unpaidCents: number
  prepaidCents: number
}

// 发货金额、售后、已收、未收按筛选区间；预收（未核销）是当前余额
export function cellsOf(summary: Summary) {
  return [
    { label: copy.screen.label.shipAmount, amountCents: summary.shippedCents, due: false },
    { label: copy.screen.label.after, amountCents: summary.afterCents, due: false },
    { label: copy.screen.label.received, amountCents: summary.receivedCents, due: false },
    { label: copy.screen.label.unpaid, amountCents: summary.unpaidCents, due: true },
    { label: copy.screen.label.prepaidBalance, amountCents: summary.prepaidCents, due: false },
  ]
}

// 标题「SO-… · 部分收」，售后抵扣的加「（售后抵扣）」
export function orderSheetOf(order: ArOrder) {
  const suffix = order.offsetByAfter ? copy.screen.label.offsetByAfter : ''
  return {
    title: [order.orderNo, labels.payStatus[order.payStatus]].join(copy.separator) + suffix,
    rows: rowsOf([
      [copy.screen.label.shipAmount, formatMoney(order.shippedCents)],
      [copy.screen.label.receivable, formatMoney(order.receivableCents)],
      [copy.screen.label.received, formatMoney(order.receivedCents)],
      [copy.screen.label.unpaid, formatMoney(order.unpaidCents)],
    ]),
    afters: order.afters.map((after) => afterRowOf(after, false)),
    allocs: allocRowsOf(order.allocations, 'receipt'),
  }
}

export function afterSheetOf(after: AfterDetail) {
  const action = findAction(after.actions, 'voidAfter')
  return {
    info: {
      title: after.no,
      statusKind: 'afterStatus',
      status: after.status,
      rows: afterInfoOf(after),
    },
    lines: afterLinesOf(after),
    reasonRows: afterReasonsOf(after),
    canVoid: action?.enabled === true,
    voidRequired: action?.reasonRequired === true,
  }
}
