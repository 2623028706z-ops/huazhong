// 订货、结算用哪一份购物车（06 章 S1、S5）：平时是本机购物车；从订单详情「修改订单」进来是改单模式，
// 用单独一份（只在内存里，改完或返回就丢），原购物车不变
import {
  copy,
  entryCopy,
  formatMoney,
  type OrderDetail,
  type StoreCatalogItem,
} from '@huazhong/shared'
import { loadCart, pruneCart, saveCart, type CartLine } from '../../core/cart'
import { lineCents, sumCents } from '../../core/money'

interface EditDraft {
  orderId: string
  version: number
  orderDate: string
  note: string
  lines: CartLine[]
  // 原订单的行：核对修改时比数量和金额
  original: CartLine[]
  // 原订单里已停用的产品：不去掉，到结算页标「已停用」
  discontinued: string[]
}

let draft: EditDraft | null = null

export function startEdit(order: OrderDetail): void {
  const lines = order.lines.map((line) => ({
    productId: line.productId,
    qty: line.qty,
    name: line.name,
    unit: line.unit,
    priceCents: line.priceCents,
  }))
  draft = {
    orderId: order.id,
    version: order.version,
    orderDate: order.orderDate,
    note: order.note ?? '',
    lines,
    original: lines,
    discontinued: order.lines.filter((line) => line.discontinued).map((line) => line.productId),
  }
}

export function editDraft(): EditDraft | null {
  return draft
}

export function reviewEdit(order: OrderDetail, catalog: readonly StoreCatalogItem[] | null): void {
  if (!draft || draft.orderId !== order.id) return
  draft = {
    ...draft,
    version: order.version,
    discontinued: draft.lines
      .filter((line) =>
        catalog
          ? !catalog.some((item) => item.productId === line.productId)
          : order.lines.some((item) => item.productId === line.productId && item.discontinued),
      )
      .map((line) => line.productId),
  }
}

export function endEdit(): void {
  draft = null
}

export interface CartSource {
  load: () => CartLine[]
  save: (lines: CartLine[]) => void
}

export function cartSourceOf(isEdit: boolean, accountId: string): CartSource {
  if (isEdit) {
    return {
      load: () => draft?.lines ?? [],
      save: (lines) => {
        if (draft) draft = { ...draft, lines }
      },
    }
  }
  return {
    load: () => loadCart(accountId),
    save: (lines) => {
      saveCart(accountId, lines)
    },
  }
}

// 打开时核对目录（S1、S2、S5）：普通购物车去掉停用的并提示一次；改单模式不去掉。
// 拿不到目录（客户停用）时照快照显示
export function syncWithCatalog(
  source: CartSource,
  catalog: readonly StoreCatalogItem[] | null,
  isEdit: boolean,
): CartLine[] {
  const lines = source.load()
  if (!catalog) return lines
  const pruned = pruneCart(lines, catalog)
  // 改单模式：在目录里的按当前目录价预览（后端按当前目录价重算），停用的留着
  if (isEdit) {
    const kept = new Map(pruned.lines.map((line) => [line.productId, line]))
    return lines.map((line) => kept.get(line.productId) ?? line)
  }
  if (pruned.removed.length > 0) {
    source.save(pruned.lines)
    void wx.showToast({
      title: copy.store.removedFromCart(pruned.removed.join(copy.order.nameSeparator)),
      icon: 'none',
    })
  }
  return pruned.lines
}

// 购物车、结算的明细：改单模式里原订单停用的行标「已停用」
export function cartLinesOf(lines: readonly CartLine[], isEdit: boolean) {
  const discontinued = isEdit ? (draft?.discontinued ?? []) : []
  return lines.map((line) => ({
    key: line.productId,
    removable: discontinued.includes(line.productId),
    name: line.name,
    tags: discontinued.includes(line.productId)
      ? [{ text: copy.screen.tag.discontinued, warn: false }]
      : [],
    amountCents: lineCents(line.qty, line.priceCents),
    qty: line.qty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
  }))
}

// 改单核对（06 章 S1、07 章 E03）：和原单比，结算条小字写比原单多 / 少多少（没变不写），
// 弹层列出改了数量的行「原数量 → 新数量」（删掉的写 → 0，新加的写 0 →）
export function editReviewOf(lines: readonly CartLine[]) {
  const original = draft?.original ?? []
  const totalOf = (rows: readonly CartLine[]) =>
    sumCents(rows, (line) => lineCents(line.qty, line.priceCents))
  const diff = totalOf(lines) - totalOf(original)
  const ids = [...new Set([...original, ...lines].map((line) => line.productId))]
  const changes = ids.flatMap((id) => {
    const before = original.find((line) => line.productId === id)
    const after = lines.find((line) => line.productId === id)
    const from = before?.qty ?? 0
    const to = after?.qty ?? 0
    const line = after ?? before
    if (!line || from === to) return []
    return [{ key: id, name: line.name, text: entryCopy.qtyChange(from, to) }]
  })
  const amount = formatMoney(Math.abs(diff))
  return {
    diffText: diff > 0 ? entryCopy.diffMore(amount) : diff < 0 ? entryCopy.diffLess(amount) : '',
    changes,
  }
}
