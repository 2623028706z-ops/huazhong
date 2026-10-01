// 应收、已收、未收、预收（纯函数，03 章第 4 节、04 章第 8 节）：核销表只存登记金额，生效金额按登记顺序现算。
// 作废售后、作废收款后不改核销表，重算即可：同一笔钱不会算两次，预收不会是负数
import type { ArCard, PayStatus, UnitTotal } from '@huazhong/shared'

export interface LedgerOrder {
  orderId: number
  orderNo: string
  storeId: number
  storeName: string
  shipDate: string
  units: UnitTotal[]
  shippedCents: number
  afterCents: number
}

// 有效收款；按 (receipt_date, id) 先后扣预收
export interface LedgerReceipt {
  id: number
  no: string
  receiptDate: string
  amountCents: number
}

// 没撤回的核销（所属收款有效），按 (created_at, id) 先后
export interface LedgerAllocation {
  id: number
  receiptId: number
  orderId: number
  amountCents: number
}

export interface Replay {
  // 每张发货单已收
  received: Map<number, number>
  // 每笔收款还没核销掉的（预收）
  left: Map<number, number>
  // 每条核销的生效金额（≤ 0 的不在里面）
  effective: Map<number, number>
}

// 应收 = 发货金额 − 已处理售后，不小于 0
function receivableOf(order: Pick<LedgerOrder, 'shippedCents' | 'afterCents'>): number {
  return Math.max(order.shippedCents - order.afterCents, 0)
}

// 逐条算生效金额 = min(登记金额, 发货单剩余应收, 这笔收款剩余)，≤ 0 跳过
export function replayLedger(
  orders: readonly LedgerOrder[],
  receipts: readonly LedgerReceipt[],
  allocations: readonly LedgerAllocation[],
): Replay {
  const receivable = new Map(orders.map((order) => [order.orderId, receivableOf(order)]))
  const received = new Map(orders.map((order) => [order.orderId, 0]))
  const left = new Map(receipts.map((receipt) => [receipt.id, receipt.amountCents]))
  const effective = new Map<number, number>()
  for (const alloc of allocations) {
    const due = (receivable.get(alloc.orderId) ?? 0) - (received.get(alloc.orderId) ?? 0)
    const rest = left.get(alloc.receiptId) ?? 0
    const amount = Math.min(alloc.amountCents, due, rest)
    if (amount <= 0) continue
    effective.set(alloc.id, amount)
    received.set(alloc.orderId, (received.get(alloc.orderId) ?? 0) + amount)
    left.set(alloc.receiptId, rest - amount)
  }
  return { received, left, effective }
}

// 未收 ≤ 0 已收；已收 > 0 部分收；否则未收
function payStatusOf(unpaidCents: number, receivedCents: number): PayStatus {
  if (unpaidCents <= 0) return 'paid'
  return receivedCents > 0 ? 'partial' : 'unpaid'
}

export function toArCard(order: LedgerOrder, receivedCents: number): ArCard {
  const receivableCents = receivableOf(order)
  const unpaidCents = Math.max(receivableCents - receivedCents, 0)
  return {
    orderId: String(order.orderId),
    orderNo: order.orderNo,
    shipDate: order.shipDate,
    storeName: order.storeName,
    units: order.units,
    shippedCents: order.shippedCents,
    afterCents: order.afterCents,
    receivableCents,
    receivedCents,
    unpaidCents,
    payStatus: payStatusOf(unpaidCents, receivedCents),
    // 售后刚好抵完：应收 0 且售后 > 0
    offsetByAfter: receivableCents === 0 && order.afterCents > 0,
  }
}

export interface Draw {
  receiptId: number
  orderId: number
  amountCents: number
}

// 核销预收：每条按收款先后从有余额的收款里扣；调用前已核对合计 ≤ 预收
export function drawPrepaid(
  receipts: readonly LedgerReceipt[],
  left: ReadonlyMap<number, number>,
  requests: readonly { orderId: number; amountCents: number }[],
): Draw[] {
  const ordered = [...receipts].sort(
    (a, b) => a.receiptDate.localeCompare(b.receiptDate) || a.id - b.id,
  )
  const rest = new Map(left)
  const draws: Draw[] = []
  for (const request of requests) {
    let need = request.amountCents
    for (const receipt of ordered) {
      if (need === 0) break
      const amount = Math.min(need, rest.get(receipt.id) ?? 0)
      if (amount <= 0) continue
      draws.push({ receiptId: receipt.id, orderId: request.orderId, amountCents: amount })
      rest.set(receipt.id, (rest.get(receipt.id) ?? 0) - amount)
      need -= amount
    }
  }
  return draws
}

export interface ArSummary {
  shippedCents: number
  afterCents: number
  receivedCents: number
  unpaidCents: number
}

export function summaryOf(cards: readonly ArCard[]): ArSummary {
  const sum = (pick: (card: ArCard) => number) =>
    cards.reduce((total, card) => total + pick(card), 0)
  return {
    shippedCents: sum((card) => card.shippedCents),
    afterCents: sum((card) => card.afterCents),
    receivedCents: sum((card) => card.receivedCents),
    unpaidCents: sum((card) => card.unpaidCents),
  }
}
