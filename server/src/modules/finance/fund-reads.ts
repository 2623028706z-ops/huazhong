import {
  statementCopy,
  type PaymentDetail,
  type ReceiptDetail,
  type RefundDetail,
} from '@huazhong/shared'
import { desc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  receipts,
  payments,
  statements,
  settlementLinks,
  creditUses,
  refunds,
  customers,
  suppliers,
} from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { sumOf, exactNumber } from '../../common/domain/units.ts'
import { actors, owns } from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { refundViews } from './refund-reads.ts'
import { page, type Query } from './statement-reads.ts'
export type FundKind = 'receipt' | 'payment'
export type FundRow = typeof receipts.$inferSelect | typeof payments.$inferSelect
type Use = typeof creditUses.$inferSelect
type Link = { link: typeof settlementLinks.$inferSelect; statement: typeof statements.$inferSelect }
type Snapshot = {
  viewer: Viewer
  parties: { id: number; name: string }[]
  links: Link[]
  uses: Use[]
  refunds: RefundDetail[]
  targets: (typeof statements.$inferSelect)[]
  people: Map<number, { id: string; name: string }>
}
export async function fundRow(tx: Db | Tx, input: { kind: FundKind; id: number; lock?: boolean }) {
  const { kind, id, lock } = input
  if (kind === 'receipt')
    return found(
      (
        await (lock
          ? tx.select().from(receipts).where(eq(receipts.id, id)).for('update')
          : tx.select().from(receipts).where(eq(receipts.id, id)))
      )[0],
    )
  return found(
    (
      await (lock
        ? tx.select().from(payments).where(eq(payments.id, id)).for('update')
        : tx.select().from(payments).where(eq(payments.id, id)))
    )[0],
  )
}
function usesOf(row: FundRow, uses: Use[]) {
  return uses.filter((u) =>
    'customerId' in row ? u.sourceReceiptId === row.id : u.sourcePaymentId === row.id,
  )
}
function lockReason(row: FundRow, kind: FundKind, data: Snapshot) {
  if (!owns(data.viewer, row.createdBy)) return statementCopy.ownerOnly
  const uses = usesOf(row, data.uses).filter((u) => u.releasedAt === null),
    targetId = uses.find((u) => u.statementId !== null)?.statementId
  const target = targetId ? found(data.targets.find((t) => t.id === targetId)) : null
  if (target) return statementCopy.creditLocked(kind, target.no)
  return uses.some((u) => u.refundId !== null) ? statementCopy.refundFirst : null
}
function fundInfo(row: FundRow, data: Snapshot) {
  const partyId = 'customerId' in row ? row.customerId : row.supplierId,
    party = found(data.parties.find((p) => p.id === partyId))
  return 'receiptDate' in row
    ? { customerId: String(row.customerId), customerName: party.name, receiptDate: row.receiptDate }
    : { supplierId: String(row.supplierId), supplierName: party.name, payDate: row.payDate }
}
function linkedStatements(row: FundRow, links: Link[]) {
  return links
    .filter(({ link: l }) =>
      'customerId' in row ? l.receiptId === row.id : l.paymentId === row.id,
    )
    .map(({ link: l, statement: s }) => ({
      id: String(s.id),
      no: s.no,
      periodFrom: s.periodFrom,
      periodTo: s.periodTo,
      dueCents: s.dueCents,
      amountCents: l.amountCents,
      status: s.status,
      reversedAt: l.reversedAt?.toISOString() ?? null,
    }))
}
function fundView(row: FundRow, kind: FundKind, data: Snapshot): ReceiptDetail | PaymentDetail {
  const uses = usesOf(row, data.uses),
    active = uses.filter((u) => u.releasedAt === null),
    disabled = lockReason(row, kind, data)
  return {
    ...fundInfo(row, data),
    id: String(row.id),
    no: row.no,
    version: row.version,
    amountCents: row.amountCents,
    discountCents: row.discountCents,
    discountReason: row.discountReason,
    creditCents: row.creditCents,
    creditBalanceCents:
      row.status === 'valid'
        ? exactNumber(row.creditCents - sumOf(active, (u) => u.amountCents))
        : 0,
    methodName: row.methodName,
    note: row.note,
    createdBy: found(data.people.get(row.createdBy)),
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedBy: row.voidedBy === null ? null : (data.people.get(row.voidedBy) ?? null),
    statements: linkedStatements(row, data.links),
    refunds: data.refunds.filter((r) => uses.some((u) => u.refundId === Number(r.id))),
    actions:
      row.status === 'valid'
        ? [actionOf(kind === 'receipt' ? 'voidReceipt' : 'voidPayment', disabled, true)]
        : [],
    lockedReason: disabled,
  }
}
async function snapshot(
  tx: Db | Tx,
  kind: FundKind,
  rows: FundRow[],
  viewer: Viewer,
): Promise<Snapshot> {
  const ids = rows.map((r) => r.id),
    partyIds = [...new Set(rows.map((r) => ('customerId' in r ? r.customerId : r.supplierId)))]
  const parties = await fundParties(tx, kind, partyIds)
  const links = await tx
    .select({ link: settlementLinks, statement: statements })
    .from(settlementLinks)
    .innerJoin(statements, eq(statements.id, settlementLinks.statementId))
    .where(
      kind === 'receipt'
        ? inArray(settlementLinks.receiptId, ids)
        : inArray(settlementLinks.paymentId, ids),
    )
  const uses = await tx
    .select()
    .from(creditUses)
    .where(
      kind === 'receipt'
        ? inArray(creditUses.sourceReceiptId, ids)
        : inArray(creditUses.sourcePaymentId, ids),
    )
  const refundIds = [...new Set(uses.flatMap((u) => (u.refundId === null ? [] : [u.refundId])))],
    targetIds = uses
      .filter((u) => u.releasedAt === null)
      .flatMap((u) => (u.statementId === null ? [] : [u.statementId]))
  const refundRows = refundIds.length
    ? await tx.select().from(refunds).where(inArray(refunds.id, refundIds))
    : []
  const refundDetails = await refundViews(tx, refundRows, viewer)
  const targets = targetIds.length
    ? await tx.select().from(statements).where(inArray(statements.id, targetIds))
    : []
  const people = await actors(
    tx,
    rows.flatMap((r) => [r.createdBy, r.voidedBy]),
  )
  return { viewer, parties, links, uses, refunds: refundDetails, targets, people }
}
async function fundParties(tx: Db | Tx, kind: FundKind, partyIds: number[]) {
  return kind === 'receipt'
    ? await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, partyIds))
    : await tx
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(inArray(suppliers.id, partyIds))
}
export async function fundDetails(tx: Db | Tx, kind: FundKind, rows: FundRow[], viewer: Viewer) {
  if (!rows.length) return []
  const data = await snapshot(tx, kind, rows, viewer)
  return rows.map((row) => fundView(row, kind, data))
}
function searchMatches(row: { fund: FundRow; partyName: string }, q?: string) {
  return (
    !q || row.fund.no.includes(q) || row.fund.methodName.includes(q) || row.partyName.includes(q)
  )
}
function partyMatches(row: FundRow, partyId?: string) {
  return !partyId || String('customerId' in row ? row.customerId : row.supplierId) === partyId
}
function matches(
  row: { fund: FundRow; partyName: string },
  query: Omit<Query, 'status'> & {
    partyId?: string | undefined
    status?: 'valid' | 'voided' | undefined
  },
) {
  const { fund: r } = row
  const day = 'receiptDate' in r ? r.receiptDate : r.payDate
  return (
    partyMatches(r, query.partyId) &&
    (!query.status || r.status === query.status) &&
    (!query.from || day >= query.from) &&
    (!query.to || day <= query.to) &&
    searchMatches(row, query.q)
  )
}
export async function fundRecords(
  tx: Db | Tx,
  viewer: Viewer,
  query: Omit<Query, 'status'> & {
    partyId?: string | undefined
    kind: FundKind
    status?: 'valid' | 'voided' | undefined
  },
) {
  const rows =
    query.kind === 'receipt'
      ? await tx
          .select({ fund: receipts, partyName: customers.name })
          .from(receipts)
          .innerJoin(customers, eq(customers.id, receipts.customerId))
          .orderBy(desc(receipts.id))
      : await tx
          .select({ fund: payments, partyName: suppliers.name })
          .from(payments)
          .innerJoin(suppliers, eq(suppliers.id, payments.supplierId))
          .orderBy(desc(payments.id))
  const result = page(
    rows.filter((r) => matches(r, query)).map(({ fund: r }) => ({ ...r, id: String(r.id) })),
    query,
  )
  return {
    ...result,
    items: await fundDetails(
      tx,
      query.kind,
      result.items.map((r) => ({ ...r, id: Number(r.id) })),
      viewer,
    ),
    actions: [],
    counts: {},
  }
}
