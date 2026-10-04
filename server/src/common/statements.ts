import { statementCopy } from '@huazhong/shared'
import { appError, type Topic, type StatementRef, type StatementKind } from '@huazhong/shared'
import { and, eq, inArray, isNull, lt } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import {
  accounts,
  customers,
  suppliers,
  statements,
  statementLines,
} from '../../db/schema/index.ts'
import type { Viewer } from './domain/viewer.ts'
import type { WriteContext } from './write.service.ts'
import { customerStoreIds } from './org.ts'
import { found } from './scope.ts'
import { exactNumber } from './domain/units.ts'
export const statementLockedReason = (no: string) => statementCopy.sourceLocked(no)
export async function sourceStatements(
  executor: Db | Tx,
  type: 'order' | 'after' | 'po' | 'wh',
  ids: readonly number[],
) {
  const result = new Map<number, StatementRef>()
  if (!ids.length) return result
  const rows = await executor
    .select({
      sourceId: statementLines.sourceId,
      id: statements.id,
      no: statements.no,
      status: statements.status,
    })
    .from(statementLines)
    .innerJoin(statements, eq(statements.id, statementLines.statementId))
    .where(
      and(
        eq(statementLines.sourceType, type),
        inArray(statementLines.sourceId, [...ids]),
        isNull(statementLines.releasedAt),
      ),
    )
  for (const row of rows)
    if (row.status !== 'voided')
      result.set(row.sourceId, { id: String(row.id), no: row.no, status: row.status })
  return result
}
export async function sourceStatement(
  executor: Db | Tx,
  type: 'order' | 'after' | 'po' | 'wh',
  id: number,
) {
  return (await sourceStatements(executor, type, [id])).get(id) ?? null
}
export async function assertSourceUnstatemented(
  executor: Db | Tx,
  type: 'order' | 'after' | 'po' | 'wh',
  id: number,
) {
  const ref = await sourceStatement(executor, type, id)
  if (ref) throw appError.businessRule(statementLockedReason(ref.no))
}
const MS_PER_DAY = 86400000
export function overdueDays(dueDate: string | null, today: string) {
  return dueDate && dueDate < today
    ? Math.round((Date.parse(today) - Date.parse(dueDate)) / MS_PER_DAY)
    : 0
}
export async function customerOverdues(executor: Db | Tx, ids: readonly number[], today: string) {
  const result = new Map<number, { amountCents: number; days: number }>()
  if (!ids.length) return result
  const rows = await executor
    .select({
      customerId: statements.customerId,
      amount: statements.dueCents,
      dueDate: statements.dueDate,
    })
    .from(statements)
    .where(
      and(
        inArray(statements.customerId, [...ids]),
        eq(statements.status, 'unsettled'),
        lt(statements.dueDate, today),
      ),
    )
  for (const row of rows) {
    if (row.customerId === null) continue
    const previous = result.get(row.customerId) ?? { amountCents: 0, days: 0 }
    result.set(row.customerId, {
      amountCents: exactNumber(previous.amountCents + row.amount),
      days: Math.max(previous.days, overdueDays(row.dueDate, today)),
    })
  }
  return result
}
export async function customerOverdue(executor: Db | Tx, id: number, today: string) {
  return (await customerOverdues(executor, [id], today)).get(id) ?? null
}
export function owns(viewer: Viewer | undefined, createdBy: number) {
  return viewer?.type === 'admin' || viewer?.accountId === createdBy
}
export async function actors(executor: Db | Tx, ids: readonly (number | null)[]) {
  const keep = [...new Set(ids.filter((id): id is number => id !== null))]
  const rows = keep.length
    ? await executor
        .select({ id: accounts.id, name: accounts.name })
        .from(accounts)
        .where(inArray(accounts.id, keep))
    : []
  return new Map(rows.map((r) => [r.id, { id: String(r.id), name: r.name }]))
}
export async function lockSupplierLedger(tx: Tx, id: number) {
  return found((await tx.select().from(suppliers).where(eq(suppliers.id, id)).for('update'))[0])
}
export async function lockParty(tx: Tx, kind: StatementKind, id: number) {
  return kind === 'customer'
    ? found((await tx.select().from(customers).where(eq(customers.id, id)).for('update'))[0])
    : lockSupplierLedger(tx, id)
}
export async function notifyCustomerFinance(ctx: WriteContext, customerId: number) {
  ctx.notify(
    [
      { topic: `ar:${customerId}`, version: null },
      { topic: 'todo:finance', version: null },
      { topic: 'finance_records', version: null },
    ],
    { storeIds: await customerStoreIds(ctx.tx, customerId) },
  )
}
export function notifySupplierFinance(ctx: WriteContext, supplierId: number) {
  ctx.notify(
    [
      { topic: `ap:${supplierId}`, version: null },
      { topic: `supplier:${supplierId}`, version: null },
      { topic: 'todo:finance', version: null },
      { topic: 'finance_records', version: null },
    ],
    { supplierIds: [String(supplierId)] },
  )
  return Promise.resolve()
}
export async function notifyStatement(ctx: WriteContext, id: number) {
  const [row] = await ctx.tx.select().from(statements).where(eq(statements.id, id))
  if (!row) return
  const lines = await ctx.tx.select().from(statementLines).where(eq(statementLines.statementId, id))
  const topics = lines.flatMap<{ topic: Topic; version: number | null }>((l) =>
    l.sourceType === 'order'
      ? [{ topic: `order:${l.sourceId}` as const, version: null }]
      : l.sourceType === 'after'
        ? [{ topic: `after:${l.sourceId}` as const, version: null }]
        : l.sourceType === 'po'
          ? [{ topic: `po:${l.sourceId}` as const, version: null }]
          : l.sourceType === 'wh'
            ? [{ topic: `wh_doc:${l.sourceId}` as const, version: null }]
            : [],
  )
  ctx.notify([{ topic: `statement:${id}`, version: row.version }, ...topics], {
    storeIds: [...new Set(lines.flatMap((l) => (l.storeId === null ? [] : [String(l.storeId)])))],
    supplierIds: row.supplierId === null ? [] : [String(row.supplierId)],
  })
  if (row.kind === 'customer') await notifyCustomerFinance(ctx, row.customerId ?? 0)
  else await notifySupplierFinance(ctx, row.supplierId ?? 0)
}
export {
  creditSourcesByParty,
  creditSources,
  useCredit,
  notifyCreditSources,
  type CreditSource,
} from './statement-credit.ts'
