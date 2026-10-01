// 订货、结算用哪一份购物车（06 章 S1、S5）：平时是本机购物车；从订单详情「修改订单」进来是改单模式，
// 用单独一份（只在内存里，改完或返回就丢），原购物车不变
import { copy, type OrderDetail, type StoreCatalogItem } from '@huazhong/shared'
import { loadCart, pruneCart, saveCart, type CartLine } from '../../core/cart'
import { lineCents } from '../../core/money'

interface EditDraft {
  orderId: string
  version: number
  orderDate: string
  note: string
  lines: CartLine[]
  // 原订单里已停订或停用的产品：不去掉，到结算页标「已停订」
  discontinued: string[]
}

let draft: EditDraft | null = null

export function startEdit(order: OrderDetail): void {
  draft = {
    orderId: order.id,
    version: order.version,
    orderDate: order.orderDate,
    note: order.note ?? '',
    lines: order.lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      name: line.name,
      unit: line.unit,
      priceCents: line.priceCents,
    })),
    discontinued: order.lines.filter((line) => line.discontinued).map((line) => line.productId),
  }
}

export function editDraft(): EditDraft | null {
  return draft
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

// 打开时核对目录（S1、S2、S5）：普通购物车去掉停订、停用的并提示一次；改单模式不去掉。
// 拿不到目录（客户停用）时照快照显示
export function syncWithCatalog(
  source: CartSource,
  catalog: readonly StoreCatalogItem[] | null,
  isEdit: boolean,
): CartLine[] {
  const lines = source.load()
  if (!catalog) return lines
  const pruned = pruneCart(lines, catalog)
  // 改单模式：在目录里的按当前目录价预览（后端按当前目录价重算），停订的留着
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

// 购物车、结算的明细：改单模式里原订单停订的行标「已停订」
export function cartLinesOf(lines: readonly CartLine[], isEdit: boolean) {
  const discontinued = isEdit ? (draft?.discontinued ?? []) : []
  return lines.map((line) => ({
    key: line.productId,
    name: line.name,
    tags: discontinued.includes(line.productId)
      ? [{ text: copy.screen.tag.discontinued, warn: true }]
      : [],
    amountCents: lineCents(line.qty, line.priceCents),
    qty: line.qty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
  }))
}
