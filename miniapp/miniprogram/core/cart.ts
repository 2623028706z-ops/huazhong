// 门店购物车（06 章第 4 节）：按账号存在这台手机上，不走接口；退出登录清空（阶段 3 确认）。
// 存产品、数量和加购时的名称、单位、目录价快照：客户停用拿不到目录时也能照常显示；
// 能拿到目录时名称、价格以目录为准，不在目录里的（停用）去掉
export interface CartLine {
  productId: string
  qty: number
  name: string
  unit: string
  priceCents: number
}

interface CatalogEntry {
  productId: string
  name: string
  unit: string
  listPriceCents: number
}

const KEY_PREFIX = 'hz-cart:'

function keyOf(accountId: string): string {
  return KEY_PREFIX + accountId
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return (
    typeof line.productId === 'string' &&
    typeof line.qty === 'number' &&
    line.qty > 0 &&
    typeof line.name === 'string' &&
    typeof line.unit === 'string' &&
    typeof line.priceCents === 'number'
  )
}

export function loadCart(accountId: string): CartLine[] {
  const stored: unknown = wx.getStorageSync(keyOf(accountId))
  return Array.isArray(stored) ? stored.filter(isCartLine) : []
}

export function saveCart(accountId: string, lines: readonly CartLine[]): void {
  wx.setStorageSync(
    keyOf(accountId),
    lines.filter((line) => line.qty > 0),
  )
}

// 退出登录：这台手机上所有账号的购物车都清掉
export function clearCarts(): void {
  for (const key of wx.getStorageInfoSync().keys) {
    if (key.startsWith(KEY_PREFIX)) wx.removeStorageSync(key)
  }
}

export function countOf(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0)
}

export function qtyOf(lines: readonly CartLine[], productId: string): number {
  return lines.find((line) => line.productId === productId)?.qty ?? 0
}

// 改数量：0 = 去掉这一行；新产品加在最后，快照取目录
export function withQty(lines: readonly CartLine[], item: CatalogEntry, qty: number): CartLine[] {
  const next: CartLine = {
    productId: item.productId,
    qty,
    name: item.name,
    unit: item.unit,
    priceCents: item.listPriceCents,
  }
  const exists = lines.some((line) => line.productId === item.productId)
  const updated = exists
    ? lines.map((line) => (line.productId === item.productId ? next : line))
    : [...lines, next]
  return updated.filter((line) => line.qty > 0)
}

// 按目录核对：在目录里的刷新快照，不在的去掉并返回名称（toast 提示一次）
export function pruneCart(
  lines: readonly CartLine[],
  catalog: readonly CatalogEntry[],
): { lines: CartLine[]; removed: string[] } {
  const byId = new Map(catalog.map((item) => [item.productId, item]))
  const kept: CartLine[] = []
  const removed: string[] = []
  for (const line of lines) {
    const item = byId.get(line.productId)
    if (item)
      kept.push({ ...line, name: item.name, unit: item.unit, priceCents: item.listPriceCents })
    else removed.push(line.name)
  }
  return { lines: kept, removed }
}
