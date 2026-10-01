// 订单的显示（06 章第 1.1 节、S3、S6、X2、X3、H2、H3）：门店、销售、发货共用。
// 这里只把后端返回的字段换成组件要的样子，不判断能不能操作（00 章第 1 节）
import {
  copy,
  formatMoney,
  formatTime,
  formatUnitTotals,
  labels,
  type OrderCard,
  type OrderChange,
  type OrderDetail,
  type OrderLine,
} from '@huazhong/shared'

interface Tag {
  text: string
  warn: boolean
}

export interface InfoRow {
  label: string
  value: string
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
    date: order.orderDate,
    status: order.status,
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
  if (line.short) tags.push({ text: copy.screen.tag.short, warn: true })
  if (line.discontinued && !shipped) tags.push({ text: copy.screen.tag.discontinued, warn: true })
  return tags
}

// 只读明细：已发货显示实发
function orderLinesOf(order: OrderDetail) {
  const shipped = order.status === 'shipped'
  return order.lines.map((line) => ({
    key: line.id,
    name: line.name,
    tags: lineTagsOf(line, shipped),
    amountCents: line.amountCents,
    qty: line.shippedQty ?? line.qty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
  }))
}

// 有值才显示的「标签 + 值」
export function rowsOf(rows: readonly [string, string | null][]): InfoRow[] {
  return rows
    .filter((row): row is [string, string] => row[1] !== null && row[1] !== '')
    .map(([label, value]) => ({ label, value }))
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

// 金额：发货前订单金额，已发货发货金额
function amountRowOf(order: OrderDetail): InfoRow {
  const label =
    order.status === 'shipped' ? copy.screen.label.shipAmount : copy.screen.label.orderAmount
  return { label, value: formatMoney(order.amountCents) }
}

// 发货人、发货时间、发货备注
function shipInfoOf(order: OrderDetail): InfoRow[] {
  return rowsOf([
    [copy.screen.label.shippedBy, order.shippedBy],
    [copy.screen.label.shippedAt, order.shippedAt === null ? null : formatTime(order.shippedAt)],
    [copy.screen.label.shipNote, order.shipNote],
  ])
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

// 详情页（S6、X3、H3 只读）：信息卡 → 明细 → 金额 → 发货信息 → 变更记录 → 原因行。
// 员工多写来源、客户门店
export function orderViewOf(order: OrderDetail, forStore: boolean) {
  const staffRows: [string, string | null][] = forStore
    ? []
    : [
        [copy.screen.label.origin, labels.orderOrigin[order.origin]],
        [copy.screen.label.customerStore, copy.org.store(order.customerName, order.storeName)],
      ]
  return {
    info: {
      title: order.no,
      statusKind: 'orderStatus',
      status: order.status,
      rows: rowsOf([
        ...staffRows,
        [copy.screen.label.orderDate, order.orderDate],
        [copy.field.shipDate, shipDateText(order.shipDate)],
        [copy.field.note, order.note],
      ]),
    },
    lines: orderLinesOf(order),
    amountRows: [amountRowOf(order)],
    shipRows: shipInfoOf(order),
    changes: changesOf(order.changes),
    reasonRows: cancelInfoOf(order),
    notice: order.lockedReason ?? '',
  }
}
