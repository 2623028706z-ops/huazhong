// 订单卡片、明细行的组装（纯函数）：金额、合计、标记、actions 都在这里算，前端只显示
import type { OrderCard, OrderLine, OrderStatus } from '@huazhong/shared'
import { sumOf, unitTotalsOf } from '../../../common/domain/units.ts'
import { orderActionsOf, type OrderRoles } from './order-actions.ts'

export interface OrderRow {
  id: number
  no: string
  version: number
  status: OrderStatus
  origin: OrderCard['origin']
  orderDate: string
  shipDate: string | null
  customerId: number
  customerName: string
  customerEnabled: boolean
  storeId: number
  storeName: string
  storeEnabled: boolean
  shippedDay: string | null
  changed: boolean
}

export interface LineRow {
  id: number
  orderId: number
  productId: number
  name: string
  unit: string
  customerCode: string
  qty: number
  priceCents: number
  listPriceCents: number
  shippedQty: number | null
  // 这一行待处理、已处理售后的合计
  claimedQty: number
  // 目录里停用或产品本身停用
  discontinued: boolean
}

// 待确认、待发货才标「已停用」；已发货的照常显示
export function isOpenOrder(status: OrderStatus): boolean {
  return status === 'pending_confirm' || status === 'to_ship'
}

export function toOrderLine(line: LineRow, open: boolean): OrderLine {
  const shipped = line.shippedQty
  return {
    id: String(line.id),
    productId: String(line.productId),
    name: line.name,
    unit: line.unit,
    customerCode: line.customerCode,
    qty: line.qty,
    priceCents: line.priceCents,
    listPriceCents: line.listPriceCents,
    repriced: line.priceCents !== line.listPriceCents,
    discontinued: open && line.discontinued,
    shippedQty: shipped,
    short: shipped !== null && shipped < line.qty,
    maxQty: shipped === null ? null : Math.max(shipped - line.claimedQty, 0),
    amountCents: (shipped ?? line.qty) * line.priceCents,
  }
}

export function toOrderCard(
  row: OrderRow,
  lines: readonly LineRow[],
  roles: OrderRoles,
  today: string,
): OrderCard {
  const views = lines.map((line) => toOrderLine(line, isOpenOrder(row.status)))
  const facts = {
    status: row.status,
    storeEnabled: row.storeEnabled,
    customerEnabled: row.customerEnabled,
    discontinued: views.filter((line) => line.discontinued).map((line) => line.name),
    shipDate: row.shipDate,
    shippedDay: row.shippedDay,
    claimable: views.some((line) => (line.maxQty ?? 0) > 0),
  }
  return {
    id: String(row.id),
    no: row.no,
    version: row.version,
    status: row.status,
    origin: row.origin,
    orderDate: row.orderDate,
    shipDate: row.shipDate,
    customerId: String(row.customerId),
    customerName: row.customerName,
    storeId: String(row.storeId),
    storeName: row.storeName,
    lineName: views[0]?.name ?? '',
    lineCount: views.length,
    units: unitTotalsOf(
      views.map((line) => ({ unit: line.unit, qty: line.shippedQty ?? line.qty })),
    ),
    amountCents: sumOf(views, (line) => line.amountCents),
    changed: row.changed,
    repriced: views.some((line) => line.repriced),
    ...orderActionsOf(roles, facts, today),
  }
}
