import { statementCopy, type RefundDetail } from '@huazhong/shared'
import { inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import type { refunds } from '../../../db/schema/index.ts'
import { receipts, payments, statements, creditUses } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { actors, owns } from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
type Use = typeof creditUses.$inferSelect
type Refund = typeof refunds.$inferSelect
async function sources(tx: Db | Tx, uses: Use[]) {
  const ids = (field: 'sourceReceiptId' | 'sourcePaymentId' | 'sourceStatementId') =>
    uses.flatMap((u) => (u[field] === null ? [] : [u[field]]))
  const r = ids('sourceReceiptId'),
    p = ids('sourcePaymentId'),
    s = ids('sourceStatementId')
  const rs = r.length
    ? await tx
        .select({ id: receipts.id, no: receipts.no })
        .from(receipts)
        .where(inArray(receipts.id, r))
    : []
  const ps = p.length
    ? await tx
        .select({ id: payments.id, no: payments.no })
        .from(payments)
        .where(inArray(payments.id, p))
    : []
  const ss = s.length
    ? await tx
        .select({ id: statements.id, no: statements.no })
        .from(statements)
        .where(inArray(statements.id, s))
    : []
  return new Map([
    ...rs.map((r) => [`receipt:${r.id}`, r.no] as const),
    ...ps.map((r) => [`payment:${r.id}`, r.no] as const),
    ...ss.map((r) => [`statement:${r.id}`, r.no] as const),
  ])
}
function sourceOf(u: Use, names: Map<string, string>) {
  const type =
    u.sourceReceiptId !== null
      ? ('receipt' as const)
      : u.sourcePaymentId !== null
        ? ('payment' as const)
        : ('statement' as const)
  const id = u.sourceReceiptId ?? u.sourcePaymentId ?? u.sourceStatementId ?? 0
  return { type, id: String(id), no: found(names.get(`${type}:${id}`)), amountCents: u.amountCents }
}
function refundOf(
  row: Refund,
  context: {
    viewer: Viewer
    uses: Use[]
    names: Map<string, string>
    people: Map<number, { id: string; name: string }>
  },
): RefundDetail {
  return {
    id: String(row.id),
    no: row.no,
    version: row.version,
    kind: row.kind,
    customerId: row.customerId === null ? null : String(row.customerId),
    supplierId: row.supplierId === null ? null : String(row.supplierId),
    refundDate: row.refundDate,
    amountCents: row.amountCents,
    methodName: row.methodName,
    note: row.note,
    status: row.status,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedBy: row.voidedBy === null ? null : (context.people.get(row.voidedBy) ?? null),
    sources: context.uses
      .filter((u) => u.refundId === row.id)
      .map((u) => sourceOf(u, context.names)),
    actions:
      row.status === 'valid'
        ? [
            actionOf(
              'voidRefund',
              owns(context.viewer, row.createdBy) ? null : statementCopy.ownerOnly,
              true,
            ),
          ]
        : [],
  }
}
export async function refundViews(tx: Db | Tx, rows: Refund[], viewer: Viewer) {
  if (!rows.length) return []
  const uses = await tx
    .select()
    .from(creditUses)
    .where(
      inArray(
        creditUses.refundId,
        rows.map((r) => r.id),
      ),
    )
  const names = await sources(tx, uses)
  const people = await actors(
    tx,
    rows.map((r) => r.voidedBy),
  )
  return rows.map((row) => refundOf(row, { viewer, uses, names, people }))
}
export async function refundView(tx: Db | Tx, row: Refund, viewer: Viewer) {
  return found((await refundViews(tx, [row], viewer))[0])
}
