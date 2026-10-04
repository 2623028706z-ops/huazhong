import { orderProgress, externalProgressOf, statementText } from './progress'
// 订单的显示（06 章第 1.1 节、S3、S6、X2、X3、H2、H3）：门店、销售、发货共用。
// 这里只把后端返回的字段换成组件要的样子，不判断能不能操作（00 章第 1 节）
import {
  copy,
  redesignCopy,
  formatMoney,
  formatTime,
  formatUnitTotals,
  labels,
  type OrderCard,
  type OrderChange,
  type OrderDetail,
  type OrderLine,
  type ShippingCard,
  type ShippingDetail,
} from '@huazhong/shared'

interface Tag {
  text: string
  warn: boolean
}

export interface InfoRow {
  label: string
  value: string
  url?: string
  phone?: string
  wide?: boolean
}

// 待确认的门店单没有出货日期：「待销售安排」
export function shipDateText(shipDate: string | null): string {
  return shipDate ?? copy.order.shipDatePending
}

// 第一种产品 + 一共几种：「粉玫瑰日常花束 等 2 项」
export function lineTitleOf(name: string, count: number): string {
  return count > 1 ? copy.order.moreItems(name, count) : name
}

function cardTagsOf(order: OrderCard): Tag[] {
  const tags: Tag[] = []
  if (order.changed) tags.push({ text: copy.screen.tag.changed, warn: false })
  if (order.repriced) tags.push({ text: copy.screen.tag.repriced, warn: true })
  if (order.cancelRequested) tags.push({ text: copy.rework.cancelPending, warn: true })
  return tags
}

// 三行卡片：①下单日期 + 状态 ②对象 + 总数 ③标记 + 单号 / 出货日期 + 金额。
// 门店看自己的单，第 2 行写产品；员工写客户门店
export function orderRowOf(order: OrderCard, forStore: boolean) {
  const title = forStore
    ? lineTitleOf(order.lineName, order.lineCount)
    : copy.org.store(order.customerName, order.storeName)
  return {
    id: order.id,
    version: order.version,
    fields: [
      { label: redesignCopy.no, value: order.no },
      { label: redesignCopy.orderDate, value: order.orderDate },
      { label: redesignCopy.shipDate, value: shipDateText(order.shipDate) },
      {
        label: order.status === 'shipped' ? redesignCopy.shippedAmount : redesignCopy.orderAmount,
        value: formatMoney(order.amountCents),
        amount: true,
      },
    ],
    date: order.orderDate,
    status: forStore && order.status === 'voided' ? 'cancelled' : order.status,
    title,
    total: formatUnitTotals(order.units),
    meta: [order.no, shipDateText(order.shipDate)].join(copy.separator),
    amount: order.amountCents,
    tags: cardTagsOf(order),
  }
}

function lineTagsOf(line: OrderLine, shipped: boolean): Tag[] {
  const tags: Tag[] = []
  if (line.repriced) tags.push({ text: copy.screen.tag.repriced, warn: true })
  if (line.short) {
    const gap = line.shippedQty === null ? 0 : line.qty - line.shippedQty
    tags.push({
      text: gap > 0 ? `${copy.screen.tag.short} ${gap} ${line.unit}` : copy.screen.tag.short,
      warn: true,
    })
  }
  if (line.over) tags.push({ text: copy.rework.overShipped, warn: true })
  if (line.discontinued && !shipped) tags.push({ text: copy.screen.tag.discontinued, warn: true })
  return tags
}

// 只读明细：已发货显示实发
function orderLinesOf(order: OrderDetail) {
  const shipped = order.status === 'shipped'
  return order.lines.map((line) => ({
    key: line.id,
    name: line.name,
    code: line.customerCode,
    tags: lineTagsOf(line, shipped),
    amountCents: line.amountCents,
    qty: line.shippedQty ?? line.qty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
  }))
}

// 有值才显示的「标签 + 值」
export function rowsOf(
  rows: readonly [string, string | null, { url?: string; phone?: string; wide?: boolean }?][],
): InfoRow[] {
  return rows
    .filter(
      (row): row is [string, string, { url?: string; phone?: string; wide?: boolean }?] =>
        row[1] !== null && row[1] !== '',
    )
    .map(([label, value, link]) => ({ label, value, ...link }))
}

function changesOf(changes: readonly OrderChange[]) {
  return changes.map((change) => ({
    id: change.id,
    at: change.createdAt,
    actor: change.actorLabel,
    changes: change.items,
    reason: change.reason,
  }))
}

// 原因行：取消原因、取消时间
function cancelInfoOf(order: OrderDetail): InfoRow[] {
  return rowsOf([
    [copy.screen.label.cancelReason, order.cancelReason],
    [
      copy.screen.label.cancelledAt,
      order.cancelledAt === null ? null : formatTime(order.cancelledAt),
    ],
  ])
}

function voidInfoOf(
  order: { voidReason: string | null; voidedAt: string | null },
  external = false,
) {
  return {
    heading: external ? copy.screen.section.cancel : copy.screen.section.void,
    rows: rowsOf([
      [external ? copy.screen.label.cancelReason : copy.screen.label.voidReason, order.voidReason],
      [
        external ? copy.screen.label.cancelledAt : copy.screen.label.voidedAt,
        order.voidedAt ? formatTime(order.voidedAt) : null,
      ],
    ]),
  }
}

// 详情页（S6、X3、H3 只读）：信息卡 → 产品明细（明细 + 金额）→ 发货信息 → 变更记录 → 取消信息。
// 员工多写来源、客户门店
export function orderViewOf(order: OrderDetail, forStore: boolean, finance = false) {
  return {
    progress: forStore ? externalProgressOf(orderProgress(order)) : orderProgress(order),
    quantityOnly: false,
    qtyLabel: order.status === 'shipped' ? redesignCopy.actual : redesignCopy.qty,
    shipNote: order.shipNote,
    shipNoteLabel: copy.screen.label.shipNote,
    info: orderInfoOf(order, forStore, finance),
    linesHeading: copy.screen.section.lines,
    lines: orderLinesOf(order),
    ship: {
      heading: copy.screen.section.ship,
      rows: rowsOf([[copy.screen.label.shipNote, order.shipNote]]),
    },
    changes: changesOf(order.changes),
    cancelNotice: cancelNoticeOf(order),
    requests: cancelRequestRowsOf(order.cancelRequests),
    void: voidInfoOf(order, forStore),
    reason: { heading: copy.screen.section.cancel, rows: cancelInfoOf(order) },
    notice: order.lockedReason ?? '',
  }
}

function cancelNoticeOf(order: {
  status: string
  cancelRequests: OrderDetail['cancelRequests']
}): string {
  const request = order.cancelRequests.at(-1)
  if (!request) return ''
  if (request.status === 'rejected')
    return redesignCopy.cancelRejectedNotice(request.rejectReason ?? '')
  if (request.status === 'lapsed') return redesignCopy.cancelUnhandledNotice
  if (request.status === 'pending')
    return redesignCopy.cancelPendingNotice(
      request.requestedBy,
      formatTime(request.requestedAt),
      request.reason,
    )
  return ''
}

function cancelRequestRowsOf(requests: OrderDetail['cancelRequests']) {
  return requests.map((request) => ({
    id: request.id,
    rows: rowsOf([
      [copy.rework.cancelRequest, labels.cancelRequestStatus[request.status]],
      [copy.rework.cancelRequestReasonLabel, request.reason],
      [copy.rework.cancelRequestedAt, formatTime(request.requestedAt)],
      [copy.rework.cancelHandledAt, request.handledAt ? formatTime(request.handledAt) : null],
      [copy.rework.rejectReason, request.rejectReason],
    ]),
  }))
}

export function shippingRowOf(order: ShippingCard) {
  return {
    id: order.id,
    version: order.version,
    fields: [
      { label: redesignCopy.no, value: order.no },
      { label: redesignCopy.shipDate, value: shipDateText(order.shipDate) },
      { label: redesignCopy.product, value: formatUnitTotals(order.units) },
    ],
    date: order.orderDate,
    status: order.status,
    title: copy.org.store(order.customerName, order.storeName),
    total: formatUnitTotals(order.units),
    meta: [order.no, shipDateText(order.shipDate)].join(copy.separator),
    tags: [
      ...(order.changed ? [{ text: copy.screen.tag.changed, warn: false }] : []),
      ...(order.cancelRequested ? [{ text: copy.rework.cancelPending, warn: true }] : []),
    ],
  }
}

export function shippingViewOf(order: ShippingDetail) {
  return {
    progress: orderProgress(order),
    quantityOnly: true,
    qtyLabel: redesignCopy.qty,
    shipNote: order.shipNote,
    shipNoteLabel: copy.screen.label.shipNote,
    info: shippingInfoOf(order),
    linesHeading: copy.screen.section.lines,
    lines: order.lines.map((line) => ({
      key: line.id,
      name: line.name,
      code: line.customerCode,
      qty: line.shippedQty ?? line.qty,
      orderedQty: line.qty,
      unit: line.unit,
      tags: [
        ...(line.short ? [{ text: copy.screen.tag.short, warn: true }] : []),
        ...(line.over ? [{ text: copy.rework.overShipped, warn: true }] : []),
      ],
    })),
    ship: {
      heading: copy.screen.section.ship,
      rows: rowsOf([
        [copy.screen.label.shippedBy, order.shippedBy],
        [copy.screen.label.shippedAt, order.shippedAt ? formatTime(order.shippedAt) : null],
        [copy.screen.label.shipNote, order.shipNote],
      ]),
    },
    changes: changesOf(order.changes),
    cancelNotice: cancelNoticeOf(order),
    requests: cancelRequestRowsOf(order.cancelRequests),
    reason: {
      heading: copy.screen.section.cancel,
      rows: rowsOf([
        [copy.screen.label.cancelReason, order.cancelReason],
        [copy.screen.label.cancelledAt, order.cancelledAt ? formatTime(order.cancelledAt) : null],
      ]),
    },
    void: voidInfoOf(order),
    noteNotice: order.note && order.status === 'to_ship' ? redesignCopy.orderNote(order.note) : '',
    notice: order.lockedReason ?? '',
  }
}

export function shippingInfoOf(order: ShippingDetail) {
  return {
    title: copy.org.store(order.customerName, order.storeName),
    statusKind: 'orderStatus',
    status: order.status,
    rows: rowsOf([
      [redesignCopy.no, order.no],
      [copy.field.shipDate, shipDateText(order.shipDate)],
      [redesignCopy.shipper, order.shippedBy],
      [redesignCopy.shippedAt, order.shippedAt ? formatTime(order.shippedAt) : null],
      [
        redesignCopy.contact,
        [order.contactName, order.contactPhone].filter(Boolean).join(' ') || redesignCopy.notFilled,
        order.contactPhone ? { wide: true, phone: order.contactPhone } : { wide: true },
      ],
      [redesignCopy.address, order.address || redesignCopy.notFilled, { wide: true }],
    ]),
    cols: true,
  }
}

function orderInfoOf(order: OrderDetail, forStore: boolean, finance: boolean) {
  const staffRows: [string, string | null, { url?: string; phone?: string; wide?: boolean }?][] =
    forStore ? [] : [[copy.screen.label.origin, labels.orderOrigin[order.origin]]]
  return {
    title: copy.org.store(order.customerName, order.storeName),
    statusKind: 'orderStatus',
    status: forStore && order.status === 'voided' ? 'cancelled' : order.status,
    rows: rowsOf([
      [redesignCopy.no, order.no],
      ...staffRows,
      [copy.screen.label.orderDate, order.orderDate],
      [copy.field.shipDate, shipDateText(order.shipDate)],
      [redesignCopy.shipper, forStore ? null : order.shippedBy],
      [redesignCopy.shippedAt, order.shippedAt ? formatTime(order.shippedAt) : null],
      [
        redesignCopy.statement,
        order.status === 'shipped' ? statementText(order.statement) : null,
        order.statement
          ? {
              wide: true,
              url: forStore
                ? `/packages/store/pages/statement-detail/index?id=${order.statement.id}`
                : `/packages/finance/pages/statement-detail/index?scope=${finance ? 'finance' : 'internal'}&id=${order.statement.id}`,
            }
          : { wide: true },
      ],
      [copy.field.note, order.note, { wide: true }],
    ]),
    cols: true,
  }
}
