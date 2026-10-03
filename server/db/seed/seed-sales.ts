// 写入阶段 3 的示例数据（sales-data.ts）：产品、订货目录、订单、售后、收款、收付款方式、发号起点
import type { Tx } from '../client.ts'
import {
  afterLines,
  afters,
  allocations,
  catalogCategories,
  catalogItems,
  docSequences,
  orderLines,
  orders,
  paymentMethods,
  productBomLines,
  productCategories,
  products,
  receipts,
} from '../schema/index.ts'
import {
  seedAfters,
  seedCashier,
  seedCatalog,
  seedCatalogCategories,
  seedMethodNames,
  seedOrders,
  seedProductCategories,
  seedProducts,
  seedReceipts,
  seedShipper,
  type SeedOrderLine,
} from './sales-data.ts'

export interface SeedIds {
  admin: number
  accounts: Map<string, number>
  customers: Map<string, number>
  stores: Map<string, number>
  materials: Map<string, number>
}

export function idOf<T>(ids: Map<string, T>, key: string): T {
  const id = ids.get(key)
  if (id === undefined) throw new Error(`unknown seed key ${key}`)
  return id
}

interface LineRef {
  id: number
  price: number
  name: string
  unit: string
}

// 订单：售后、核销要用它的 id 和明细行
interface OrderRef {
  id: number
  customerId: number
  storeId: number
  lines: Map<string, LineRef>
}

async function insertProducts(tx: Tx, ids: SeedIds): Promise<Map<string, number>> {
  const createdBy = ids.admin
  const categoryIds = new Map<string, number>()
  for (const c of seedProductCategories) {
    const [row] = await tx
      .insert(productCategories)
      .values({ name: c.name, sort: c.sort, createdBy })
      .returning()
    if (row) categoryIds.set(c.key, row.id)
  }
  const productIds = new Map<string, number>()
  for (const p of seedProducts) {
    const categoryId = idOf(categoryIds, p.category)
    const [row] = await tx
      .insert(products)
      .values({ name: p.name, categoryId, unit: p.unit, createdBy })
      .returning()
    if (!row) continue
    productIds.set(p.key, row.id)
    const bom = p.bom.map((b) => ({
      productId: row.id,
      materialId: idOf(ids.materials, b.material),
      qty: b.qty,
      createdBy,
    }))
    await tx.insert(productBomLines).values(bom)
  }
  await insertCatalog(tx, ids, productIds)
  return productIds
}

// 每个客户的订货分类和目录项
async function insertCatalog(tx: Tx, ids: SeedIds, productIds: Map<string, number>) {
  const createdBy = ids.admin
  const catalogCategoryIds = new Map<string, number>()
  for (const c of seedCatalogCategories) {
    const [row] = await tx
      .insert(catalogCategories)
      .values({
        customerId: idOf(ids.customers, c.customer),
        name: c.name,
        sort: c.sort,
        createdBy,
      })
      .returning()
    if (row) catalogCategoryIds.set(c.key, row.id)
  }
  const catalog = seedCatalog.map((c) => ({
    customerId: idOf(ids.customers, c.customer),
    productId: idOf(productIds, c.product),
    categoryId: idOf(catalogCategoryIds, c.category),
    customerCode: c.code,
    priceCents: c.price,
    enabled: c.enabled,
    createdBy,
  }))
  await tx.insert(catalogItems).values(catalog)
}

async function insertOrderLines(
  tx: Tx,
  order: { id: number; createdBy: number; customer: string },
  seedLines: readonly SeedOrderLine[],
  productIds: Map<string, number>,
): Promise<Map<string, LineRef>> {
  const lines = new Map<string, LineRef>()
  for (const [sort, line] of seedLines.entries()) {
    const product = seedProducts.find((p) => p.key === line.product)
    if (!product) throw new Error(`unknown seed product ${line.product}`)
    const [lineRow] = await tx
      .insert(orderLines)
      .values({
        orderId: order.id,
        productId: idOf(productIds, line.product),
        name: product.name,
        unit: product.unit,
        // 下单时的客户产品编码快照
        customerCode:
          seedCatalog.find((c) => c.customer === order.customer && c.product === line.product)
            ?.code ?? '',
        qty: line.qty,
        priceCents: line.price,
        listPriceCents: line.listPrice,
        shippedQty: line.shipped ?? null,
        sort,
        createdBy: order.createdBy,
      })
      .returning()
    if (lineRow) {
      lines.set(line.product, {
        id: lineRow.id,
        price: line.price,
        name: product.name,
        unit: product.unit,
      })
    }
  }
  return lines
}

async function insertOrders(tx: Tx, ids: SeedIds, productIds: Map<string, number>) {
  const refs = new Map<string, OrderRef>()
  for (const o of seedOrders) {
    const customerId = idOf(ids.customers, o.customer)
    const storeId = idOf(ids.stores, o.store)
    const shipped =
      o.shippedAt === undefined
        ? {}
        : {
            shippedBy: idOf(ids.accounts, seedShipper),
            shippedAt: new Date(o.shippedAt),
            shipNote: o.shipNote ?? '',
          }
    const [row] = await tx
      .insert(orders)
      .values({
        no: o.no,
        orderDate: o.orderDate,
        shipDate: o.shipDate,
        customerId,
        storeId,
        status: o.status,
        origin: o.origin,
        note: o.note,
        createdBy: idOf(ids.accounts, o.createdBy),
        ...shipped,
      })
      .returning()
    if (!row) continue
    const order = { id: row.id, createdBy: row.createdBy, customer: o.customer }
    const lines = await insertOrderLines(tx, order, o.lines, productIds)
    refs.set(o.no, { id: row.id, customerId, storeId, lines })
  }
  return refs
}

// 示例里的售后都是门店提交、待处理（07 章第 12.5 节）
async function insertAfters(tx: Tx, ids: SeedIds, refs: Map<string, OrderRef>): Promise<void> {
  for (const a of seedAfters) {
    const order = idOf(refs, a.order)
    const createdBy = idOf(ids.accounts, a.createdBy)
    const [row] = await tx
      .insert(afters)
      .values({
        no: a.no,
        afterDate: a.afterDate,
        orderId: order.id,
        customerId: order.customerId,
        storeId: order.storeId,
        status: 'pending',
        origin: 'store',
        createdBy,
      })
      .returning()
    if (!row) continue
    const lines = a.lines.map((l, sort) => {
      const line = idOf(order.lines, l.product)
      return {
        afterId: row.id,
        orderLineId: line.id,
        name: line.name,
        unit: line.unit,
        requestedQty: l.qty,
        qty: l.qty,
        priceCents: line.price,
        reason: l.reason,
        description: l.description,
        sort,
        createdBy,
      }
    })
    await tx.insert(afterLines).values(lines)
  }
}
async function insertReceipts(tx: Tx, ids: SeedIds, refs: Map<string, OrderRef>): Promise<void> {
  const createdBy = ids.admin
  const methods = seedMethodNames.map((name, sort) => ({ name, sort, createdBy }))
  await tx.insert(paymentMethods).values(methods)
  const cashier = idOf(ids.accounts, seedCashier)
  for (const r of seedReceipts) {
    const createdAt = new Date(r.createdAt)
    const [row] = await tx
      .insert(receipts)
      .values({
        no: r.no,
        receiptDate: r.receiptDate,
        customerId: idOf(ids.customers, r.customer),
        amountCents: r.amount,
        methodName: r.method,
        note: r.note,
        createdBy: cashier,
        createdAt,
      })
      .returning()
    if (!row) continue
    const allocs = r.allocs.map((a) => ({
      receiptId: row.id,
      orderId: idOf(refs, a.order).id,
      amountCents: a.amount,
      kind: 'direct' as const,
      createdBy: cashier,
      createdAt,
    }))
    await tx.insert(allocations).values(allocs)
  }
}

// 发号从示例单号之后接着发，新单不会和示例单号重复
const DOC_NO = /^([A-Z]{2})-(\d{2})(\d{2})(\d{2})-(\d+)$/

// SO-260929-018 → { prefix: SO, day: 2026-09-29, last: 18 }
function parseDocNo(no: string): { prefix: string; day: string; last: number } {
  const match = DOC_NO.exec(no)
  if (!match) throw new Error(`bad seed doc no ${no}`)
  const [, prefix = '', yy = '', mm = '', dd = '', seq = '0'] = match
  return { prefix, day: `20${yy}-${mm}-${dd}`, last: Number(seq) }
}

export async function insertDocSequences(tx: Tx, nos: readonly string[]): Promise<void> {
  const last = new Map<string, { prefix: string; day: string; last: number }>()
  for (const no of nos) {
    const parsed = parseDocNo(no)
    const key = `${parsed.prefix} ${parsed.day}`
    if ((last.get(key)?.last ?? 0) < parsed.last) last.set(key, parsed)
  }
  if (last.size > 0) await tx.insert(docSequences).values([...last.values()])
}

export async function insertSales(tx: Tx, ids: SeedIds): Promise<void> {
  const productIds = await insertProducts(tx, ids)
  const refs = await insertOrders(tx, ids, productIds)
  await insertAfters(tx, ids, refs)
  await insertReceipts(tx, ids, refs)
  await insertDocSequences(tx, [
    ...seedOrders.map((o) => o.no),
    ...seedAfters.map((a) => a.no),
    ...seedReceipts.map((r) => r.no),
  ])
}
