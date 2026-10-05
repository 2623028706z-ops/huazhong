// S1「上一单」「再来一单」（06 章 S1，2026-10-06 体验改版第 2 批）：上一单 = 本店最近一张没取消、没作废的订单
// （含待确认、待发货）；再来一单把它的产品和数量加进购物车，同款换成上一单的数量，其余照留，单价按现在的订货价，
// 不在目录里的（已停用）跳过
import {
  PAGE_SIZE_MAX,
  contract,
  copy,
  entryCopy,
  type OrderDetail,
  type StoreCatalogItem,
} from '@huazhong/shared'
import { withQty, type CartLine } from '../../core/cart'
import { request, type Result } from '../../core/request'

const SKIPPED = new Set(['cancelled', 'voided'])

// 没下过单（或全是取消、作废的）返回 null
export async function loadLastOrder(): Promise<Result<OrderDetail | null>> {
  let cursor: string | undefined
  for (;;) {
    const page = await request(contract.listOrders, { query: { limit: PAGE_SIZE_MAX, cursor } })
    if (!page.ok) return page
    const card = page.data.items.find((item) => !SKIPPED.has(item.status))
    if (card) return request(contract.getOrder, { params: { id: card.id } })
    if (!page.data.nextCursor) return { ok: true, data: null }
    cursor = page.data.nextCursor
  }
}

// 「上一单」条：单号、下单日期 · 产品 数量单位、…
export function lastOrderViewOf(order: OrderDetail | null) {
  if (!order) return null
  return {
    title: `${entryCopy.lastOrder} ${order.no}`,
    meta: entryCopy.lastOrderMeta(
      order.orderDate,
      order.lines
        .map((line) => entryCopy.lastOrderLine(line.name, line.qty, line.unit))
        .join(copy.order.nameSeparator),
    ),
  }
}

export function reorderLines(
  cart: readonly CartLine[],
  order: OrderDetail,
  catalog: readonly StoreCatalogItem[],
): { lines: CartLine[]; skipped: string[] } {
  let lines = [...cart]
  const skipped: string[] = []
  for (const line of order.lines) {
    const item = catalog.find((entry) => entry.productId === line.productId)
    if (item) lines = withQty(lines, item, line.qty)
    else skipped.push(line.name)
  }
  return { lines, skipped }
}
