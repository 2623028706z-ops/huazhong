// 售后的显示（06 章 S7、S8、X5–X7、F3）：门店、销售、财务共用。只换字段，不判断能不能操作
import {
  afterReasons,
  copy,
  redesignCopy,
  formatMoney,
  formatQty,
  formatTime,
  formatUnitTotals,
  labels,
  type AfterCard,
  type AfterDetail,
  type AfterLine,
} from '@huazhong/shared'
import { lineTitleOf, rowsOf } from './order'

// 问题原因下拉（S8、X7）
export const reasonOptions = afterReasons.map((id) => ({ id, name: labels.afterReason[id] }))

// 金额为 null：门店的待处理写「待确认」，其余写「—」
function amountTextOf(after: AfterCard, forStore: boolean): string {
  if (after.amountCents !== null) return ''
  return forStore && after.status === 'pending' ? copy.after.pendingAmount : copy.screen.noAmount
}

// 三行卡片：①提交日期 + 状态 ②门店写产品，员工写客户门店 + 总数 ③单号 · 原订单 + 金额
export function afterRowOf(after: AfterCard, forStore: boolean) {
  return {
    id: after.id,
    fields: [
      { label: redesignCopy.no, value: after.no, wide: true },
      { label: redesignCopy.submittedDate, value: after.afterDate },
      {
        label: redesignCopy.afterAmount,
        value: after.amountCents === null ? redesignCopy.pending : formatMoney(after.amountCents),
        amount: after.amountCents !== null,
      },
      { label: redesignCopy.originalOrder, value: after.orderNo, wide: true },
    ],
    date: after.afterDate,
    status: forStore && after.status === 'voided' ? 'cancelled' : after.status,
    title: forStore
      ? lineTitleOf(after.lineName, after.lineCount)
      : copy.org.store(after.customerName, after.storeName),
    total: formatUnitTotals(after.units),
    meta: [after.no, after.orderNo].join(copy.separator),
    amount: after.amountCents,
    amountText: amountTextOf(after, forStore),
  }
}

// 门店原来申请的数量和售后数量不同：「3 束 → 2 束」
function qtyTextOf(line: AfterLine): string {
  const qty = formatQty(line.qty, line.unit)
  if (line.requestedQty === null || line.requestedQty === line.qty) return qty
  return formatQty(line.requestedQty, line.unit) + copy.log.arrow + qty
}

// 只读的售后产品：原因、说明、图片直接展开
export function afterLinesOf(after: AfterDetail) {
  return after.lines.map((line) => ({
    key: line.id,
    name: line.name,
    amountText: line.amountCents === null ? '' : formatMoney(line.amountCents),
    meta: [qtyTextOf(line), labels.afterReason[line.reason]].join(copy.separator),
    description: line.description,
    images: line.images.map((image) => ({ url: image.url, thumbUrl: image.thumbUrl })),
    urls: line.images.map((image) => image.url),
  }))
}

export function afterInfoOf(after: AfterDetail, forStore = false) {
  return rowsOf([
    [redesignCopy.no, after.no],
    [
      copy.screen.label.sourceOrder,
      after.orderNo,
      {
        url: `/packages/${forStore ? 'store' : 'sales'}/pages/order-detail/index?id=${after.orderId}`,
      },
    ],
    [copy.screen.label.customerStore, copy.org.store(after.customerName, after.storeName)],
    [copy.field.shipDate, after.shipDate],
    [copy.screen.label.afterDate, after.afterDate],
    [copy.screen.label.origin, labels.afterOrigin[after.origin]],
    [
      copy.screen.label.afterAmount,
      after.amountCents === null ? redesignCopy.pending : formatMoney(after.amountCents),
    ],
    [copy.screen.label.processNote, after.note],
  ])
}

// 关闭信息（关闭原因）或作废信息（作废原因和作废时间）
export function afterReasonsOf(after: AfterDetail, external = false) {
  const heading = after.voidReason === null ? copy.screen.section.close : copy.screen.section.void
  return {
    heading: external && after.voidReason !== null ? copy.screen.section.cancel : heading,
    rows: rowsOf([
      [copy.screen.label.closeReason, after.closeReason],
      [external ? copy.screen.label.cancelReason : copy.screen.label.voidReason, after.voidReason],
      [
        external ? copy.screen.label.cancelledAt : copy.screen.label.voidedAt,
        after.voidedAt === null ? null : formatTime(after.voidedAt),
      ],
    ]),
  }
}

type PreviewEvent = WechatMiniprogram.TouchEvent<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  { url: string; urls: string[] }
>

// 点缩略图看大图（02 章第 3 节）
export function previewImage(event: PreviewEvent): void {
  const { url, urls } = event.currentTarget.dataset
  void wx.previewImage({ current: url, urls })
}
