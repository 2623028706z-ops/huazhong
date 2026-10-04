import {
  statementCopy,
  statementCardSchema,
  type StatementDetail,
  type StatementSource,
  type StatementCard,
} from '@huazhong/shared'
import { and, inArray, isNull, or } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import type { statements } from '../../../db/schema/index.ts'
import {
  customers,
  suppliers,
  statementLines,
  settlementLinks,
  receipts,
  payments,
  creditUses,
} from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { actionOf, enabledAction } from '../../common/domain/actions.ts'
import { sumOf, exactNumber } from '../../common/domain/units.ts'
import { actors, overdueDays } from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
export type StatementRow = typeof statements.$inferSelect
type SourceLine = typeof statementLines.$inferSelect
type Settlement = StatementDetail['settlements'][number]
type Person = StatementDetail['createdBy']
type Snapshot = {
  names: Map<string, string>
  lines: SourceLine[]
  settlements: Map<number, Settlement[]>
  used: Set<number>
  people: Map<number, Person>
}
function sourceOf(l: SourceLine): StatementSource {
  return {
    type: l.sourceType as StatementSource['type'],
    id: String(l.sourceId),
    version: l.sourceVersion,
    sourceNo: l.sourceNo,
    sourceDate: l.sourceDate,
    storeId: l.storeId === null ? null : String(l.storeId),
    storeName: l.storeName,
    amountCents: l.amountCents,
    carriesAmount: l.carriesAmount,
    previousPeriod: l.previousPeriod,
    selected: true,
    ...(l.parentType === null || l.parentId === null
      ? {}
      : { parentType: l.parentType as 'po' | 'wh', parentId: String(l.parentId) }),
  }
}
function groupsOf(sources: StatementSource[]) {
  const groups = new Map<string, StatementDetail['groups'][number]>()
  for (const source of sources) {
    const key = source.storeId ?? ''
    const group = groups.get(key) ?? {
      storeId: source.storeId,
      storeName: source.storeName,
      amountCents: 0,
      sources: [],
    }
    group.sources.push(source)
    if (source.carriesAmount)
      group.amountCents = exactNumber(group.amountCents + source.amountCents)
    groups.set(key, group)
  }
  return [...groups.values()]
}
async function partyNames(tx: Db | Tx, rows: StatementRow[]) {
  const customerIds = rows.flatMap((r) => (r.customerId === null ? [] : [r.customerId]))
  const supplierIds = rows.flatMap((r) => (r.supplierId === null ? [] : [r.supplierId]))
  const cs = customerIds.length
    ? await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, customerIds))
    : []
  const ss = supplierIds.length
    ? await tx
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(inArray(suppliers.id, supplierIds))
    : []
  return new Map([
    ...cs.map((p) => [`customer:${p.id}`, p.name] as const),
    ...ss.map((p) => [`supplier:${p.id}`, p.name] as const),
  ])
}
type Link = typeof settlementLinks.$inferSelect
// 一笔收付款一次核销了几张对账单时，优惠按对账单从早到晚先抵，抵完剩下的才算实收
function discountShares(live: Link[], discountOf: (link: Link) => number) {
  const left = new Map<string, number>()
  const shares = new Map<number, number>()
  for (const l of [...live].sort((a, b) => a.statementId - b.statementId)) {
    const fund = l.receiptId === null ? `p${l.paymentId}` : `r${l.receiptId}`
    const rest = left.get(fund) ?? discountOf(l)
    const share = Math.min(rest, l.amountCents)
    left.set(fund, rest - share)
    shares.set(l.id, share)
  }
  return shares
}
async function fundsOf(tx: Db | Tx, links: Link[]) {
  const receiptIds = links.flatMap((l) => (l.receiptId === null ? [] : [l.receiptId]))
  const paymentIds = links.flatMap((l) => (l.paymentId === null ? [] : [l.paymentId]))
  const rs = receiptIds.length
    ? await tx.select().from(receipts).where(inArray(receipts.id, receiptIds))
    : []
  const ps = paymentIds.length
    ? await tx.select().from(payments).where(inArray(payments.id, paymentIds))
    : []
  const fundOf = (l: Link) =>
    found(
      l.receiptId === null
        ? ps.find((p) => p.id === l.paymentId)
        : rs.find((r) => r.id === l.receiptId),
    )
  const sameFund = [
    ...(receiptIds.length ? [inArray(settlementLinks.receiptId, receiptIds)] : []),
    ...(paymentIds.length ? [inArray(settlementLinks.paymentId, paymentIds)] : []),
  ]
  const live = sameFund.length
    ? await tx
        .select()
        .from(settlementLinks)
        .where(and(or(...sameFund), isNull(settlementLinks.reversedAt)))
    : []
  return { fundOf, shares: discountShares(live, (l) => fundOf(l).discountCents) }
}
type FundRow = typeof receipts.$inferSelect | typeof payments.$inferSelect
function settlementOf(l: Link, f: FundRow, share: number): Settlement {
  return {
    id: String(f.id),
    no: f.no,
    kind: l.receiptId === null ? 'payment' : 'receipt',
    date: 'receiptDate' in f ? f.receiptDate : f.payDate,
    amountCents: f.amountCents,
    discountCents: f.discountCents,
    creditCents: f.creditCents,
    coveredCents: l.amountCents,
    appliedDiscountCents: share,
    receivedCents: l.amountCents - share,
    methodName: f.methodName,
    status: f.status,
    reversedAt: l.reversedAt?.toISOString() ?? null,
  }
}
async function settlementRows(tx: Db | Tx, ids: number[]) {
  const links = await tx
    .select()
    .from(settlementLinks)
    .where(inArray(settlementLinks.statementId, ids))
  const { fundOf, shares } = await fundsOf(tx, links)
  const result = new Map<number, Settlement[]>()
  for (const l of links) {
    const list = result.get(l.statementId) ?? []
    list.push(settlementOf(l, fundOf(l), shares.get(l.id) ?? 0))
    result.set(l.statementId, list)
  }
  return result
}
async function snapshot(tx: Db | Tx, rows: StatementRow[]): Promise<Snapshot> {
  const ids = rows.map((r) => r.id)
  const names = await partyNames(tx, rows)
  const lines = await tx
    .select()
    .from(statementLines)
    .where(inArray(statementLines.statementId, ids))
    .orderBy(statementLines.sort)
  const settlements = await settlementRows(tx, ids)
  const uses = await tx
    .select()
    .from(creditUses)
    .where(and(inArray(creditUses.sourceStatementId, ids), isNull(creditUses.releasedAt)))
  const people = await actors(
    tx,
    rows.flatMap((r) => [r.createdBy, r.voidedBy]),
  )
  return {
    names,
    lines,
    settlements,
    used: new Set(uses.flatMap((u) => (u.sourceStatementId === null ? [] : [u.sourceStatementId]))),
    people,
  }
}
function voidReason(row: StatementRow, s: Snapshot) {
  if ((s.settlements.get(row.id) ?? []).some((l) => l.status === 'valid' && l.reversedAt === null))
    return row.kind === 'customer' ? statementCopy.receivedLocked : statementCopy.paidLocked
  return s.used.has(row.id) ? statementCopy.creditUsed : null
}
function actionsOf(row: StatementRow, s: Snapshot) {
  if (row.status === 'voided') return []
  return [
    enabledAction('shareStatement', null),
    ...(row.status === 'unsettled'
      ? [enabledAction(row.kind === 'customer' ? 'registerReceipt' : 'registerPayment', null)]
      : []),
    // 作废对账单所有财务都能做（2026-10-04 用户定），不限开单人
    actionOf('voidStatement', voidReason(row, s), true),
  ]
}
function cardOf(
  row: StatementRow,
  s: Snapshot,
  context: { viewer: Viewer; today: string },
): StatementCard {
  return {
    id: String(row.id),
    no: row.no,
    version: row.version,
    kind: row.kind,
    partyId: String(row.customerId ?? row.supplierId),
    partyName: found(s.names.get(`${row.kind}:${row.customerId ?? row.supplierId ?? 0}`)),
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    statementDate: row.statementDate,
    dueDate: row.dueDate,
    settledAt: row.settledAt?.toISOString() ?? null,
    amountCents: row.dueCents,
    dueCents: row.dueCents,
    sourceCount: s.lines.filter(
      (l) => l.statementId === row.id && ['order', 'po', 'wh'].includes(l.sourceType),
    ).length,
    status: row.status,
    overdueDays: row.status === 'unsettled' ? overdueDays(row.dueDate, context.today) : 0,
    lockedReason: voidReason(row, s),
    actions: actionsOf(row, s),
  }
}
function detailOf(
  row: StatementRow,
  s: Snapshot,
  context: { viewer: Viewer; today: string },
): StatementDetail {
  const sources = s.lines.filter((l) => l.statementId === row.id).map(sourceOf)
  const returnCents = -sumOf(
    sources.filter((s) => s.type === 'purchase_return'),
    (s) => s.amountCents,
  )
  const liveSettlements = (s.settlements.get(row.id) ?? []).filter(
    (l) => l.status === 'valid' && l.reversedAt === null,
  )
  return {
    ...cardOf(row, s, context),
    createdBy: found(s.people.get(row.createdBy)),
    createdAt: row.createdAt.toISOString(),
    note: row.note,
    voidReason: row.voidReason,
    voidedBy: row.voidedBy === null ? null : (s.people.get(row.voidedBy) ?? null),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    grossCents: row.grossCents,
    openingDebtCents: row.openingDebtCents,
    creditDeductedCents: row.creditDeductedCents,
    creditGeneratedCents: row.creditGeneratedCents,
    shippedCents: sumOf(
      sources.filter((s) => s.type === 'order'),
      (s) => s.amountCents,
    ),
    afterCents: -sumOf(
      sources.filter((s) => s.type === 'after'),
      (s) => s.amountCents,
    ),
    receivedCents: row.kind === 'supplier' ? exactNumber(row.grossCents + returnCents) : 0,
    returnCents,
    settledCents: sumOf(liveSettlements, (l) => l.receivedCents),
    settledDiscountCents: sumOf(liveSettlements, (l) => l.appliedDiscountCents),
    groups: groupsOf(sources),
    settlements: s.settlements.get(row.id) ?? [],
  }
}
export async function statementViews(
  tx: Db | Tx,
  rows: StatementRow[],
  context: { viewer: Viewer; today: string },
) {
  if (!rows.length) return []
  const data = await snapshot(tx, rows)
  return rows.map((row) => detailOf(row, data, context))
}
export async function statementCards(
  tx: Db | Tx,
  rows: StatementRow[],
  context: { viewer: Viewer; today: string },
) {
  return (await statementViews(tx, rows, context)).map((d) => statementCardSchema.parse(d))
}
