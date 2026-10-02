// 订单卡片、明细行的组装（纯函数）：金额、合计、标记、actions 都在这里算，前端只显示
import { copy, type OrderCard, type OrderLine, type OrderStatus } from '@huazhong/shared'
import { sumOf, unitTotalsOf } from '../../../common/domain/units.ts'
import { orderActionsOf, type OrderRoles } from './order-actions.ts'

export interface OrderRow {
  createdBy?: number
  confirmedBy?: number | null
  cancelRequested?: boolean
  cancelRejected?: boolean
  hasLiveAllocation?: boolean
  hasLiveAfter?: boolean
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

export function ownsOrder(
  row: Pick<OrderRow, 'origin' | 'status' | 'createdBy' | 'confirmedBy'>,
  roles: Pick<OrderRoles, 'accountId' | 'admin'>,
): boolean {
  const owner =
    row.origin === 'store'
      ? row.status === 'pending_confirm'
        ? roles.accountId
        : row.confirmedBy
      : row.createdBy
  return roles.admin === true || roles.accountId === owner
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
    over: shipped !== null && shipped > line.qty,
    maxQty: shipped === null ? null : Math.max(shipped - line.claimedQty, 0),
    amountCents: (shipped ?? line.qty) * line.priceCents,
  }
}

function cancelActions(row: OrderRow, roles: OrderRoles, owned: boolean): OrderCard['actions'] {
  const actions: OrderCard['actions'] = []
  if (roles.store && row.status === 'to_ship' && !row.cancelRejected)
    actions.push({
      code: row.cancelRequested ? 'withdrawCancel' : 'requestCancel',
      enabled: true,
      disabledReason: null,
      reasonRequired: false,
    })
  if (roles.sales && row.status === 'to_ship' && row.cancelRequested && owned)
    actions.push(
      { code: 'approveCancel', enabled: true, disabledReason: null, reasonRequired: false },
      { code: 'rejectCancel', enabled: true, disabledReason: null, reasonRequired: true },
    )
  return actions
}
function cardActions(row: OrderRow, views: OrderLine[], roles: OrderRoles, today: string) {
  const facts = {
    status: row.status,
    storeEnabled: row.storeEnabled,
    customerEnabled: row.customerEnabled,
    discontinued: views.filter((line) => line.discontinued).map((line) => line.name),
    shipDate: row.shipDate,
    shippedDay: row.shippedDay,
    claimable: views.some((line) => (line.maxQty ?? 0) > 0),
  }
  const actionSet = orderActionsOf(roles, facts, today)
  const owned = ownsOrder(row, roles)
  const actions = actionSet.actions
    .filter(
      (action) => !row.cancelRequested || (action.code !== 'cancel' && action.code !== 'edit'),
    )
    .map((action) =>
      action.code === 'cancel' && !owned
        ? { ...action, enabled: false as const, disabledReason: copy.error.forbidden }
        : action,
    )
  actions.push(...cancelActions(row, roles, owned))
  if (
    roles.sales &&
    row.status === 'shipped' &&
    owned &&
    !row.hasLiveAllocation &&
    !row.hasLiveAfter
  )
    actions.push({ code: 'voidOrder', enabled: true, disabledReason: null, reasonRequired: true })
  return { ...actionSet, actions }
}
export function toOrderCard(
  row: OrderRow,
  lines: readonly LineRow[],
  roles: OrderRoles,
  today: string,
): OrderCard {
  const views = lines.map((line) => toOrderLine(line, isOpenOrder(row.status)))
  const actionSet = cardActions(row, views, roles, today)
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
    cancelRequested: row.cancelRequested ?? false,
    repriced: views.some((line) => line.repriced),
    ...actionSet,
  }
}
