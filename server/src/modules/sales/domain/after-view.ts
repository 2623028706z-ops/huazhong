// 售后卡片、明细行、actions 的组装（纯函数，05 章第 1.5、4 节）
import type { Action, AfterCard, AfterLine, AfterStatus } from '@huazhong/shared'
import { actionOf, uniqueActions } from '../../../common/domain/actions.ts'
import { unitTotalsOf } from '../../../common/domain/units.ts'
import type { Viewer } from '../../../common/domain/viewer.ts'

export interface AfterRow {
  id: number
  no: string
  version: number
  status: AfterStatus
  origin: AfterCard['origin']
  afterDate: string
  orderId: number
  orderNo: string
  customerId: number
  customerName: string
  storeId: number
  storeName: string
  amountCents: number | null
}

export interface AfterLineRow {
  id: number
  afterId: number
  orderLineId: number
  name: string
  unit: string
  requestedQty: number | null
  qty: number
  priceCents: number
  reason: AfterLine['reason']
  description: string
  // 原发货单这一行的实发、发货单价
  shippedQty: number
  shipPriceCents: number
  // 同一行别的售后（待处理、已处理）合计
  otherClaimed: number
}

export interface AfterRoles {
  sales: boolean
  finance: boolean
}

export function afterRolesOf(viewer: Viewer): AfterRoles {
  return { sales: viewer.modules.includes('sales'), finance: viewer.modules.includes('finance') }
}

// 底部操作区：关闭售后（次）、处理售后、作废售后（次）；门店为 []
function afterActionsOf(roles: AfterRoles, status: AfterStatus): Action[] {
  const actions: Action[] = []
  if (roles.sales && status === 'pending') {
    actions.push(actionOf('closeAfter', null, true), actionOf('processAfter', null, false))
  }
  if ((roles.sales || roles.finance) && status === 'processed') {
    actions.push(actionOf('voidAfter', null, true))
  }
  return uniqueActions(actions)
}

export function toAfterCard(
  row: AfterRow,
  lines: readonly AfterLineRow[],
  roles: AfterRoles,
): AfterCard {
  return {
    id: String(row.id),
    no: row.no,
    version: row.version,
    status: row.status,
    origin: row.origin,
    afterDate: row.afterDate,
    orderId: String(row.orderId),
    orderNo: row.orderNo,
    customerName: row.customerName,
    storeName: row.storeName,
    lineName: lines[0]?.name ?? '',
    lineCount: lines.length,
    units: unitTotalsOf(lines),
    // 只有已处理的有金额（已关闭、已作废不显示金额，03 章第 7 节）
    amountCents: row.status === 'processed' ? row.amountCents : null,
    actions: afterActionsOf(roles, row.status),
    lockedReason: null,
  }
}

export function toAfterLine(
  line: AfterLineRow,
  status: AfterStatus,
  images: AfterLine['images'],
): AfterLine {
  return {
    id: String(line.id),
    orderLineId: String(line.orderLineId),
    name: line.name,
    unit: line.unit,
    requestedQty: line.requestedQty,
    qty: line.qty,
    priceCents: line.priceCents,
    shipPriceCents: line.shipPriceCents,
    maxQty: Math.max(line.shippedQty - line.otherClaimed, 0),
    amountCents: status === 'processed' ? line.qty * line.priceCents : null,
    reason: line.reason,
    description: line.description,
    images,
  }
}
