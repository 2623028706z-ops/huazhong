import { shanghaiDateOf, type StatementKind, type StatementSource } from '@huazhong/shared'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  orders,
  orderLines,
  afters,
  stores,
  purchaseOrders,
  purchaseOrderLines,
  purchaseReturns,
  purchaseReturnLines,
  priceChanges,
  whDocs,
  whDocLines,
  statementLines,
} from '../../../db/schema/index.ts'
import { exactNumber, sumOf } from '../../common/domain/units.ts'
import { found } from '../../common/scope.ts'
type Entry = { partyId: number; source: Omit<StatementSource, 'previousPeriod' | 'selected'> }
type Document = { id: number; version?: number; no: string; date: string }
type SourceFields = {
  type: StatementSource['type']
  amountCents: number
  storeId?: number
  storeName?: string
  parentType?: 'po' | 'wh'
  parentId?: number
}
type Po = typeof purchaseOrders.$inferSelect
type Wh = typeof whDocs.$inferSelect
const amountOf = (qty: number, price: number) => exactNumber(BigInt(qty) * BigInt(price))
function entry(partyId: number, doc: Document, f: SourceFields): Entry {
  return {
    partyId,
    source: {
      type: f.type,
      id: String(doc.id),
      version: doc.version ?? null,
      sourceNo: doc.no,
      sourceDate: doc.date,
      amountCents: f.amountCents,
      storeId: f.storeId === undefined ? null : String(f.storeId),
      storeName: f.storeName ?? null,
      carriesAmount: f.parentType === undefined,
      ...(f.parentType && f.parentId !== undefined
        ? { parentType: f.parentType, parentId: String(f.parentId) }
        : {}),
    },
  }
}
async function customerSources(tx: Db | Tx, partyIds: number[]) {
  const docs = await tx
    .select({ order: orders, storeName: stores.name })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(and(inArray(orders.customerId, partyIds), eq(orders.status, 'shipped')))
  const ids = docs.map((d) => d.order.id)
  const lines = ids.length
    ? await tx.select().from(orderLines).where(inArray(orderLines.orderId, ids))
    : []
  const shipped = docs.map(({ order: o, storeName }) =>
    entry(
      o.customerId,
      { ...o, date: shanghaiDateOf(found(o.shippedAt ?? undefined).getTime()) },
      {
        type: 'order',
        amountCents: sumOf(
          lines.filter((l) => l.orderId === o.id),
          (l) => amountOf(l.shippedQty ?? 0, l.priceCents),
        ),
        storeId: o.storeId,
        storeName,
      },
    ),
  )
  const processed = await tx
    .select({
      after: afters,
      customerId: orders.customerId,
      storeId: orders.storeId,
      storeName: stores.name,
    })
    .from(afters)
    .innerJoin(orders, eq(orders.id, afters.orderId))
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(and(inArray(orders.customerId, partyIds), eq(afters.status, 'processed')))
  const credits = processed.map(({ after: a, customerId, storeId, storeName }) =>
    entry(
      customerId,
      { ...a, date: shanghaiDateOf((a.processedAt ?? a.createdAt).getTime()) },
      { type: 'after', amountCents: -found(a.amountCents ?? undefined), storeId, storeName },
    ),
  )
  return [...shipped, ...credits]
}
async function purchaseSources(tx: Db | Tx, pos: Po[]) {
  const ids = pos.map((p) => p.id)
  const lines = ids.length
    ? await tx.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.poId, ids))
    : []
  return pos.map((p) =>
    entry(
      p.supplierId,
      { ...p, date: shanghaiDateOf(found(p.receivedAt ?? undefined).getTime()) },
      {
        type: 'po',
        amountCents: sumOf(
          lines.filter((l) => l.poId === p.id),
          (l) => amountOf((l.receivedQty ?? 0) - l.returnedQty, l.priceCents),
        ),
      },
    ),
  )
}
async function returnSources(tx: Db | Tx, pos: Po[]) {
  const ids = pos.map((p) => p.id)
  const docs = ids.length
    ? await tx.select().from(purchaseReturns).where(inArray(purchaseReturns.poId, ids))
    : []
  const returnIds = docs.map((r) => r.id)
  const lines = returnIds.length
    ? await tx
        .select()
        .from(purchaseReturnLines)
        .where(inArray(purchaseReturnLines.returnId, returnIds))
    : []
  return docs.map((r) => {
    const p = found(pos.find((p) => p.id === r.poId))
    return entry(
      p.supplierId,
      { id: r.id, no: p.no, date: shanghaiDateOf(r.createdAt.getTime()) },
      {
        type: 'purchase_return',
        amountCents: -sumOf(
          lines.filter((l) => l.returnId === r.id),
          (l) => amountOf(l.qty, l.priceCents),
        ),
        parentType: 'po',
        parentId: p.id,
      },
    )
  })
}
async function manualSources(tx: Db | Tx, ins: Wh[]) {
  const ids = ins.map((w) => w.id)
  const lines = ids.length
    ? await tx.select().from(whDocLines).where(inArray(whDocLines.docId, ids))
    : []
  return ins.map((w) =>
    entry(
      found(w.supplierId ?? undefined),
      { ...w, date: w.docDate },
      {
        type: 'wh',
        amountCents: sumOf(
          lines.filter((l) => l.docId === w.id),
          (l) => amountOf(l.qty, l.priceCents ?? 0),
        ),
      },
    ),
  )
}
async function priceSources(tx: Db | Tx, pos: Po[], ins: Wh[]) {
  const poIds = pos.map((p) => p.id),
    inIds = ins.map((w) => w.id)
  if (!poIds.length && !inIds.length) return []
  const docs = await tx
    .select()
    .from(priceChanges)
    .where(
      or(
        poIds.length ? inArray(priceChanges.poId, poIds) : undefined,
        inIds.length ? inArray(priceChanges.whDocId, inIds) : undefined,
      ),
    )
  return docs.map((c) => {
    const p = found(
      c.poId === null ? ins.find((w) => w.id === c.whDocId) : pos.find((p) => p.id === c.poId),
    )
    return entry(
      found(p.supplierId ?? undefined),
      { id: c.id, no: p.no, date: shanghaiDateOf(c.createdAt.getTime()) },
      {
        type: 'price_change',
        amountCents: sumOf(c.items, (l) => amountOf(l.qty, l.toCents - l.fromCents)),
        parentType: c.poId === null ? 'wh' : 'po',
        parentId: p.id,
      },
    )
  })
}
async function supplierSources(tx: Db | Tx, partyIds: number[]) {
  const pos = await tx
    .select()
    .from(purchaseOrders)
    .where(and(inArray(purchaseOrders.supplierId, partyIds), eq(purchaseOrders.status, 'received')))
  const ins = await tx
    .select()
    .from(whDocs)
    .where(
      and(
        inArray(whDocs.supplierId, partyIds),
        eq(whDocs.kind, 'in'),
        eq(whDocs.status, 'stocked_in'),
      ),
    )
  return [
    ...(await purchaseSources(tx, pos)),
    ...(await returnSources(tx, pos)),
    ...(await manualSources(tx, ins)),
    ...(await priceSources(tx, pos, ins)),
  ]
}
function sourcesInPeriod(entries: Entry[], keys: Set<string>, to: string) {
  const mains = entries.filter(
    ({ source: s }) => s.carriesAmount && !keys.has(`${s.type}:${s.id}`) && s.sourceDate <= to,
  )
  const parents = new Set(mains.map(({ source: s }) => `${s.type}:${s.id}`))
  const evidence = entries.filter(
    ({ source: s }) =>
      !s.carriesAmount &&
      parents.has(`${s.parentType ?? ''}:${s.parentId ?? ''}`) &&
      !keys.has(`${s.type}:${s.id}`),
  )
  return [...mains, ...evidence]
}
function compareSources(a: StatementSource, b: StatementSource) {
  return (
    (a.storeId ?? '').localeCompare(b.storeId ?? '') ||
    a.sourceDate.localeCompare(b.sourceDate) ||
    a.type.localeCompare(b.type) ||
    Number(a.id) - Number(b.id)
  )
}
export async function sourcesByParty(
  tx: Db | Tx,
  kind: StatementKind,
  partyIds: number[],
  period: { from: string; to: string },
): Promise<Map<number, StatementSource[]>> {
  const result = new Map(partyIds.map((id) => [id, [] as StatementSource[]]))
  if (!partyIds.length) return result
  const entries =
    kind === 'customer' ? await customerSources(tx, partyIds) : await supplierSources(tx, partyIds)
  if (!entries.length) return result
  const occupied = await tx
    .select({ type: statementLines.sourceType, id: statementLines.sourceId })
    .from(statementLines)
    .where(
      and(
        isNull(statementLines.releasedAt),
        inArray(statementLines.sourceId, [...new Set(entries.map((e) => Number(e.source.id)))]),
      ),
    )
  const keys = new Set(occupied.map((s) => `${s.type}:${s.id}`))
  for (const { partyId, source } of sourcesInPeriod(entries, keys, period.to))
    found(result.get(partyId)).push({
      ...source,
      previousPeriod: source.sourceDate < period.from,
      selected: true,
    })
  for (const sources of result.values()) sources.sort(compareSources)
  return result
}
export async function sourcesOf(
  tx: Db | Tx,
  input: { kind: StatementKind; partyId: number; from: string; to: string },
) {
  return (await sourcesByParty(tx, input.kind, [input.partyId], input)).get(input.partyId) ?? []
}
async function mainParty(
  tx: Db | Tx,
  type: StatementSource['type'],
  id: number,
): Promise<{ kind: StatementKind; id: number } | null> {
  if (type === 'order') {
    const r = (await tx.select({ id: orders.customerId }).from(orders).where(eq(orders.id, id)))[0]
    return r ? { kind: 'customer', id: r.id } : null
  }
  if (type === 'after') {
    const r = (
      await tx
        .select({ id: orders.customerId })
        .from(afters)
        .innerJoin(orders, eq(orders.id, afters.orderId))
        .where(eq(afters.id, id))
    )[0]
    return r ? { kind: 'customer', id: r.id } : null
  }
  if (type === 'po') {
    const r = (
      await tx
        .select({ id: purchaseOrders.supplierId })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
    )[0]
    return r ? { kind: 'supplier', id: r.id } : null
  }
  const r = (await tx.select({ id: whDocs.supplierId }).from(whDocs).where(eq(whDocs.id, id)))[0]
  return !r || r.id === null ? null : { kind: 'supplier', id: r.id }
}
export async function sourceParty(
  tx: Db | Tx,
  type: StatementSource['type'],
  id: number,
): Promise<{ kind: StatementKind; id: number } | null> {
  if (['order', 'after', 'po', 'wh'].includes(type)) return mainParty(tx, type, id)
  if (type === 'purchase_return') {
    const r = (
      await tx
        .select({ id: purchaseOrders.supplierId })
        .from(purchaseReturns)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReturns.poId))
        .where(eq(purchaseReturns.id, id))
    )[0]
    return r ? { kind: 'supplier', id: r.id } : null
  }
  const c = (await tx.select().from(priceChanges).where(eq(priceChanges.id, id)))[0]
  return c
    ? mainParty(tx, c.poId === null ? 'wh' : 'po', found(c.poId ?? c.whDocId ?? undefined))
    : null
}
