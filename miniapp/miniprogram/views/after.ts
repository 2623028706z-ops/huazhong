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
      { label: redesignCopy.no, value: after.no },
      { label: redesignCopy.submittedDate, value: after.afterDate },
      { label: redesignCopy.originalOrder, value: after.orderNo },
      {
        label: redesignCopy.afterAmount,
        value: after.amountCents === null ? redesignCopy.pending : formatMoney(after.amountCents),
        amount: after.amountCents !== null,
      },
    ],
    date: after.afterDate,
    status: forStore && after.status === 'voided' ? 'cancelled' : after.status,
    title: forStore
      ? `${lineTitleOf(after.lineName, after.lineCount)} ${formatUnitTotals(after.units)}`
      : copy.org.store(after.customerName, after.storeName),
    total: formatUnitTotals(after.units),
    meta: [after.no, after.orderNo].join(copy.separator),
    amount: after.amountCents,
    amountText: amountTextOf(after, forStore),
  }
}

// 只读的售后产品：申请 / 处理数量、红色原因标签、说明、图片直接展开
export function afterLinesOf(after: AfterDetail, staff = false) {
  return after.lines.map((line) => ({
    key: line.id,
    name: line.name,
    amountText: line.amountCents === null ? '' : formatMoney(line.amountCents),
    applied: [redesignCopy.appliedQty, formatQty(line.requestedQty ?? line.qty, line.unit)].join(
      ' ',
    ),
    handled: [
      redesignCopy.handledQty,
      after.status === 'processed' ? formatQty(line.qty, line.unit) : copy.screen.noAmount,
    ].join(' '),
    meta: staff ? `${redesignCopy.shipPrice} ${formatMoney(line.shipPriceCents)}` : '',
    reason: labels.afterReason[line.reason],
    description: line.description,
    images: line.images.map((image) => ({ url: image.url, thumbUrl: image.thumbUrl })),
    urls: line.images.map((image) => image.url),
  }))
}

export function afterInfoOf(after: AfterDetail, forStore = false) {
  const wide = { wide: true }
  const amount: [string, string, { wide: boolean }] = [
    copy.screen.label.afterAmount,
    after.amountCents === null ? redesignCopy.pending : formatMoney(after.amountCents),
    wide,
  ]
  const order: [string, string, { url: string; wide: boolean }] = [
    copy.screen.label.sourceOrder,
    after.orderNo,
    {
      url: `/packages/${forStore ? 'store' : 'sales'}/pages/order-detail/index?id=${after.orderId}`,
      wide: true,
    },
  ]
  if (forStore) return rowsOf([[redesignCopy.no, after.no, wide], amount, order])
  return rowsOf([
    [redesignCopy.no, after.no],
    [copy.screen.label.origin, labels.afterOrigin[after.origin]],
    [copy.screen.label.afterDate, after.afterDate],
    [copy.field.shipDate, after.shipDate],
    amount,
    order,
    [copy.screen.label.processNote, after.note, wide],
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
