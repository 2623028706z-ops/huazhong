import { shanghaiDateOf } from '@huazhong/shared'
// 写入阶段 3 的示例数据（sales-data.ts）：订货分类、各客户的产品、订单、售后、收款、收付款方式、发号起点
import type { Tx } from '../client.ts'
import { seedMaterials } from './data.ts'
import {
  afterLines,
  afters,
  statements,
  statementLines,
  settlementLinks,
  stores,
  catalogCategories,
  docSequences,
  orderLineBomLines,
  orderLines,
  orders,
  paymentMethods,
  productBomLines,
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
  seedProducts,
  seedReceipts,
  seedStatementRows,
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

export function idOf<K extends string | number, T>(ids: Map<K, T>, key: K): T {
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

// 订单：售后、对账单要用它的 id 和明细行
interface OrderRef {
  id: number
  customerId: number
  storeId: number
  lines: Map<string, LineRef>
}

// 每个客户的订货分类和自己的产品（含配方）；返回「客户:产品模板」→ 产品 id
async function insertProducts(tx: Tx, ids: SeedIds): Promise<Map<string, number>> {
  const createdBy = ids.admin
  const categoryIds = new Map<string, number>()
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
    if (row) categoryIds.set(c.key, row.id)
  }
  const productIds = new Map<string, number>()
  for (const c of seedCatalog) {
    const template = templateOf(c.product)
    const [row] = await tx
      .insert(products)
      .values({
        customerId: idOf(ids.customers, c.customer),
        name: template.name,
        unit: template.unit,
        categoryId: idOf(categoryIds, c.category),
        customerCode: c.code,
        priceCents: c.price,
        enabled: c.enabled,
        createdBy,
      })
      .returning()
    if (!row) continue
    productIds.set(productKey(c.customer, c.product), row.id)
    await tx.insert(productBomLines).values(
      bomOf(c.customer, c.product).map((b) => ({
        productId: row.id,
        materialId: idOf(ids.materials, b.material),
        qty: b.qty,
        createdBy,
      })),
    )
  }
  return productIds
}

const productKey = (customer: string, product: string) => `${customer}:${product}`

function templateOf(key: string) {
  const product = seedProducts.find((p) => p.key === key)
  if (!product) throw new Error(`unknown seed product ${key}`)
  return product
}

function bomOf(customer: string, product: string) {
  const entry = seedCatalog.find((c) => c.customer === customer && c.product === product)
  return entry?.bom ?? templateOf(product).bom
}

// 已发货的明细存一份发货时配方（和确认发货一样）
async function insertShippedBom(
  tx: Tx,
  ids: SeedIds,
  line: { id: number; createdBy: number; customer: string; product: string },
) {
  const rows = bomOf(line.customer, line.product).map((b) => {
    const material = seedMaterials.find((m) => m.key === b.material)
    if (!material) throw new Error(`unknown seed material ${b.material}`)
    return {
      orderLineId: line.id,
      materialId: idOf(ids.materials, b.material),
      materialName: material.name,
      unit: material.unit,
      qty: b.qty,
      createdBy: line.createdBy,
    }
  })
  await tx.insert(orderLineBomLines).values(rows)
}

async function insertOrderLines(
  tx: Tx,
  order: { id: number; createdBy: number; customer: string },
  seedLines: readonly SeedOrderLine[],
  refs: { ids: SeedIds; productIds: Map<string, number> },
): Promise<Map<string, LineRef>> {
  const { ids, productIds } = refs
  const lines = new Map<string, LineRef>()
  for (const [sort, line] of seedLines.entries()) {
    const product = templateOf(line.product)
    const [lineRow] = await tx
      .insert(orderLines)
      .values({
        orderId: order.id,
        productId: idOf(productIds, productKey(order.customer, line.product)),
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
    if (lineRow && (line.shipped ?? 0) > 0)
      await insertShippedBom(tx, ids, { ...order, id: lineRow.id, product: line.product })
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
    const lines = await insertOrderLines(tx, order, o.lines, { ids, productIds })
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
function seedStatementSources(nos: readonly string[], refs: Map<string, OrderRef>) {
  return nos.map((no) => {
    const ref = idOf(refs, no)
    const order = seedOrders.find((o) => o.no === no)
    if (!order?.shippedAt) throw new Error('missing seed shipped order')
    return {
      ref,
      no,
      date: shanghaiDateOf(Date.parse(order.shippedAt)),
      amount: order.lines.reduce((sum, l) => sum + (l.shipped ?? 0) * l.price, 0),
    }
  })
}
function seedStatementLines(
  sources: ReturnType<typeof seedStatementSources>,
  statementId: number,
  storeNames: Map<number, string>,
  cashier: number,
) {
  return sources.map<typeof statementLines.$inferInsert>((s, sort) => ({
    statementId,
    sourceType: 'order',
    sourceId: s.ref.id,
    sourceVersion: 1,
    sourceNo: s.no,
    sourceDate: s.date,
    storeId: s.ref.storeId,
    storeName: idOf(storeNames, s.ref.storeId),
    amountCents: s.amount,
    previousPeriod: false,
    sort,
    createdBy: cashier,
  }))
}
async function insertStatements(
  tx: Tx,
  ids: SeedIds,
  refs: Map<string, OrderRef>,
  cashier: number,
) {
  const storeNames = new Map((await tx.select().from(stores)).map((s) => [s.id, s.name]))
  const statementIds = new Map<string, { id: number; dueCents: number }>()
  for (const example of seedStatementRows) {
    const sources = seedStatementSources(example.orders, refs)
    const amount = sources.reduce((sum, s) => sum + s.amount, 0)
    const row = (
      await tx
        .insert(statements)
        .values({
          no: example.no,
          kind: 'customer',
          customerId: idOf(ids.customers, example.customer),
          periodFrom: '2026-09-01',
          periodTo: '2026-09-29',
          statementDate: '2026-09-29',
          // 账期：晨曦月结 30 天、拾光 15 天，开单日 2026-09-29 往后推
          dueDate: example.customer === 'c1' ? '2026-10-29' : '2026-10-14',
          grossCents: amount,
          dueCents: amount,
          status: example.settled ? 'settled' : 'unsettled',
          settledAt: example.settled ? new Date('2026-09-29T01:10:00.000Z') : null,
          createdBy: cashier,
          createdAt: new Date('2026-09-29T01:00:00.000Z'),
        })
        .returning()
    )[0]
    if (!row) throw new Error('missing seed statement')
    statementIds.set(row.no, { id: row.id, dueCents: amount })
    await tx.insert(statementLines).values(seedStatementLines(sources, row.id, storeNames, cashier))
  }
  return statementIds
}
async function insertReceipts(tx: Tx, ids: SeedIds, refs: Map<string, OrderRef>): Promise<void> {
  const cashier = idOf(ids.accounts, seedCashier)
  await tx
    .insert(paymentMethods)
    .values(seedMethodNames.map((name, sort) => ({ name, sort, createdBy: ids.admin })))
  const statementIds = await insertStatements(tx, ids, refs, cashier)
  for (const r of seedReceipts) {
    const row = (
      await tx
        .insert(receipts)
        .values({
          no: r.no,
          receiptDate: r.receiptDate,
          customerId: idOf(ids.customers, r.customer),
          amountCents: r.amount,
          creditCents: r.creditCents,
          methodName: r.method,
          note: r.note,
          createdBy: cashier,
          createdAt: new Date(r.createdAt),
        })
        .returning()
    )[0]
    if (!row) throw new Error('missing seed receipt')
    await tx.insert(settlementLinks).values(
      r.statements.map((no) => {
        const statement = idOf(statementIds, no)
        return {
          statementId: statement.id,
          receiptId: row.id,
          amountCents: statement.dueCents,
          createdBy: cashier,
          createdAt: new Date(r.createdAt),
        }
      }),
    )
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
    ...seedStatementRows.map((r) => r.no),
  ])
}
