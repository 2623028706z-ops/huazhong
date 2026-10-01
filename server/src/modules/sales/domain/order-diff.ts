// 改单：新旧内容比较出变更记录的每一项、日志的修改前后（纯函数，04 章第 4.4 节）
import { copy, formatMoney, formatQty, labels, type OrderStatus } from '@huazhong/shared'

export interface LineState {
  productId: number
  name: string
  unit: string
  qty: number
  priceCents: number
}

export interface OrderState {
  status: OrderStatus
  shipDate: string | null
  note: string
  lines: readonly LineState[]
}

function changedLine(old: LineState, next: LineState): string[] {
  const items: string[] = []
  if (next.qty !== old.qty) items.push(copy.order.change.qty(old.name, old.qty, next.qty))
  if (next.priceCents !== old.priceCents) {
    const from = formatMoney(old.priceCents)
    items.push(copy.order.change.price(old.name, from, formatMoney(next.priceCents)))
  }
  return items
}

function lineChanges(before: readonly LineState[], after: readonly LineState[]): string[] {
  const items: string[] = []
  for (const old of before) {
    const next = after.find((line) => line.productId === old.productId)
    items.push(...(next ? changedLine(old, next) : [copy.order.change.removed(old.name)]))
  }
  for (const next of after) {
    if (before.some((line) => line.productId === next.productId)) continue
    items.push(copy.order.change.added(next.name, next.qty, next.unit))
  }
  return items
}

// 第一次定出货日期（从空到有）不算改单（阶段 3 确认）；内容没变返回空数组
export function diffOrder(before: OrderState, after: OrderState): string[] {
  const items: string[] = []
  if (before.shipDate !== null && after.shipDate !== null && before.shipDate !== after.shipDate) {
    items.push(copy.order.change.shipDate(before.shipDate, after.shipDate))
  }
  items.push(...lineChanges(before.lines, after.lines))
  if (before.note !== after.note) items.push(copy.order.change.note)
  return items
}

// 日志里的修改前后：一行一项，日志详情只列改了的
export function orderLogView(state: OrderState): Record<string, string> {
  const view: Record<string, string> = {
    [copy.field.status]: labels.orderStatus[state.status],
    [copy.field.shipDate]: state.shipDate ?? copy.order.shipDatePending,
    [copy.field.note]: state.note,
  }
  for (const line of state.lines) {
    view[line.name] = copy.order.lineView(
      formatQty(line.qty, line.unit),
      formatMoney(line.priceCents),
    )
  }
  return view
}
