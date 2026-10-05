// 下单、改单、发货、售后提交时的规则（纯函数，03 章第 4、5 节）：不查库，只按传入的数据判断
import { appError, copy, formatMoney } from '@huazhong/shared'
import { namesText } from './order-actions.ts'

// 一个产品在这个客户下的可订情况：listPriceCents 为 null = 不是这个客户的产品
export interface CatalogEntry {
  productId: number
  name: string
  unit: string
  customerCode: string
  enabled: boolean
  listPriceCents: number | null
}

export interface OrderableEntry extends CatalogEntry {
  listPriceCents: number
}

function isOrderable(entry: CatalogEntry): entry is OrderableEntry {
  return entry.listPriceCents !== null && entry.enabled
}

// 按传入顺序返回可订的产品；不存在 → NOT_FOUND，别的客户的 → 「不在可订产品里」，
// 已停用 → discontinued(产品名)（销售「请先删掉再保存」，门店「再提交」）
export function orderableEntries(
  ids: readonly number[],
  entries: readonly CatalogEntry[],
  discontinued: (names: string) => string,
): OrderableEntry[] {
  const byId = new Map(entries.map((entry) => [entry.productId, entry]))
  const picked = ids.map((id) => byId.get(id))
  const existing = picked.filter((entry) => entry !== undefined)
  if (existing.length !== ids.length) throw appError.notFound()
  const outside = existing.filter((entry) => entry.listPriceCents === null)
  const [first] = outside
  if (first) throw appError.businessRule(copy.order.productUnavailable(first.name))
  const stopped = existing.filter((entry) => !isOrderable(entry))
  if (stopped.length > 0) {
    throw appError.businessRule(discontinued(namesText(stopped.map((entry) => entry.name))))
  }
  return existing.filter(isOrderable)
}

interface ShipLine {
  id: number
  qty: number
}

// 确认发货：明细必须正好是这张单的每一行；0 ≤ 实发 ≤ 订单数量；全 0 不能发；少发、多发的发货备注选填
export function shippedQtysOf(
  lines: readonly ShipLine[],
  input: readonly { orderLineId: string; shippedQty: number }[],
): Map<number, number> {
  const qtys = new Map(input.map((item) => [Number(item.orderLineId), item.shippedQty]))
  const covered = qtys.size === input.length && lines.every((line) => qtys.has(line.id))
  if (!covered || qtys.size !== lines.length) {
    throw appError.validation({ lines: copy.error.validationFallback })
  }
  if (lines.every((line) => qtys.get(line.id) === 0)) {
    throw appError.businessRule(copy.order.shipNothing)
  }
  return qtys
}

// 售后能挂的一行：maxQty 是可申请数量（处理时已排除这张售后本身）
export interface ClaimLine {
  id: number
  name: string
  maxQty: number
  shipPriceCents: number
}

interface ClaimInput {
  id: number
  qty: number
  priceCents: number
}

// 数量不超过可申请数量、单价只能改低；字段路径按提交的第几行
export function checkClaims(
  lines: readonly ClaimLine[],
  input: readonly ClaimInput[],
  qtyMessage: string,
): void {
  const fields: Record<string, string> = {}
  input.forEach((item, index) => {
    const line = lines.find((l) => l.id === item.id)
    if (!line) throw appError.notFound()
    if (item.qty > line.maxQty) fields[`lines.${index}.qty`] = qtyMessage
    if (item.priceCents > line.shipPriceCents) {
      const price = formatMoney(line.shipPriceCents)
      fields[`lines.${index}.priceCents`] = copy.after.priceOverShip(line.name, price)
    }
  })
  if (Object.keys(fields).length > 0) throw appError.validation(fields)
}

// 处理门店提交的售后：只能改已有的行，不能增删
function assertSameLines(existing: readonly number[], input: readonly number[]): void {
  const same = existing.length === input.length && existing.every((id) => input.includes(id))
  if (!same || new Set(input).size !== input.length) {
    throw appError.businessRule(copy.after.linesLocked)
  }
}

// 处理门店提交的售后：只改已有的行；全 0 要改成关闭；数量不超过可申请数量（已排除这张本身）、单价只能改低
export function checkProcess(
  lines: readonly { id: string; name: string; maxQty: number; shipPriceCents: number }[],
  claims: readonly ClaimInput[],
): void {
  assertSameLines(
    lines.map((line) => Number(line.id)),
    claims.map((claim) => claim.id),
  )
  if (claims.every((claim) => claim.qty === 0)) throw appError.businessRule(copy.after.allZero)
  const claimLines = lines.map((line) => ({ ...line, id: Number(line.id) }))
  checkClaims(claimLines, claims, copy.after.qtyOverMax)
}
