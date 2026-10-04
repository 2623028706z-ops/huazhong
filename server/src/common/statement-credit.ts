import { appError, statementCopy, type StatementKind } from '@huazhong/shared'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import { statements, receipts, payments, creditUses } from '../../db/schema/index.ts'
import type { WriteContext } from './write.service.ts'
import { sumOf, exactNumber } from './domain/units.ts'
import { found } from './scope.ts'
export type CreditSource = {
  type: 'receipt' | 'payment' | 'statement'
  id: number
  no: string
  amountCents: number
  createdAt: Date
  balance: number
}
type PartyCredit = CreditSource & { partyId: number }
async function fundCredits(
  executor: Db | Tx,
  kind: StatementKind,
  ids: number[],
): Promise<PartyCredit[]> {
  const rows =
    kind === 'customer'
      ? await executor
          .select()
          .from(receipts)
          .where(and(inArray(receipts.customerId, ids), eq(receipts.status, 'valid')))
      : await executor
          .select()
          .from(payments)
          .where(and(inArray(payments.supplierId, ids), eq(payments.status, 'valid')))
  return rows
    .filter((f) => f.creditCents > 0)
    .map((f) => ({
      partyId: 'customerId' in f ? f.customerId : f.supplierId,
      type: kind === 'customer' ? 'receipt' : 'payment',
      id: f.id,
      no: f.no,
      amountCents: f.creditCents,
      balance: f.creditCents,
      createdAt: f.createdAt,
    }))
}
async function statementCredits(
  executor: Db | Tx,
  kind: StatementKind,
  ids: number[],
): Promise<PartyCredit[]> {
  const rows = await executor
    .select()
    .from(statements)
    .where(
      and(
        kind === 'customer'
          ? inArray(statements.customerId, ids)
          : inArray(statements.supplierId, ids),
        sql`${statements.status}<>'voided'`,
        sql`${statements.creditGeneratedCents}>0`,
      ),
    )
  return rows.map((s) => ({
    partyId: found(s.customerId ?? s.supplierId ?? undefined),
    type: 'statement',
    id: s.id,
    no: s.no,
    amountCents: s.creditGeneratedCents,
    balance: s.creditGeneratedCents,
    createdAt: s.createdAt,
  }))
}
async function sourceUses(executor: Db | Tx, sources: PartyCredit[]) {
  const ids = (type: CreditSource['type']) =>
    sources.filter((s) => s.type === type).map((s) => s.id)
  const r = ids('receipt'),
    p = ids('payment'),
    s = ids('statement')
  return executor
    .select()
    .from(creditUses)
    .where(
      and(
        isNull(creditUses.releasedAt),
        or(
          r.length ? inArray(creditUses.sourceReceiptId, r) : sql`false`,
          p.length ? inArray(creditUses.sourcePaymentId, p) : sql`false`,
          s.length ? inArray(creditUses.sourceStatementId, s) : sql`false`,
        ),
      ),
    )
}
function matches(source: CreditSource, use: typeof creditUses.$inferSelect) {
  return source.type === 'receipt'
    ? use.sourceReceiptId === source.id
    : source.type === 'payment'
      ? use.sourcePaymentId === source.id
      : use.sourceStatementId === source.id
}
export async function creditSourcesByParty(
  executor: Db | Tx,
  kind: StatementKind,
  partyIds: number[],
): Promise<Map<number, CreditSource[]>> {
  const result = new Map(partyIds.map((id) => [id, [] as CreditSource[]]))
  if (!partyIds.length) return result
  const all = [
    ...(await fundCredits(executor, kind, partyIds)),
    ...(await statementCredits(executor, kind, partyIds)),
  ]
  if (!all.length) return result
  const uses = await sourceUses(executor, all)
  for (const source of all) {
    source.balance = exactNumber(
      source.balance -
        sumOf(
          uses.filter((u) => matches(source, u)),
          (u) => u.amountCents,
        ),
    )
    if (source.balance < 0) throw appError.internal()
    found(result.get(source.partyId)).push(source)
  }
  for (const list of result.values())
    list.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id - b.id ||
        a.type.localeCompare(b.type),
    )
  return result
}
export async function creditSources(executor: Db | Tx, kind: StatementKind, partyId: number) {
  return (await creditSourcesByParty(executor, kind, [partyId])).get(partyId) ?? []
}
export async function useCredit(
  ctx: WriteContext,
  input: {
    kind: StatementKind
    partyId: number
    amount: number
    target: { statementId: number } | { refundId: number }
  },
) {
  const sources = await creditSources(ctx.tx, input.kind, input.partyId)
  if (sumOf(sources, (r) => r.balance) < input.amount)
    throw appError.businessRule(statementCopy.creditLow)
  let left = input.amount
  for (const source of sources) {
    const take = Math.min(left, source.balance)
    if (take <= 0) continue
    await ctx.tx.insert(creditUses).values({
      ...input.target,
      sourceReceiptId: source.type === 'receipt' ? source.id : null,
      sourcePaymentId: source.type === 'payment' ? source.id : null,
      sourceStatementId: source.type === 'statement' ? source.id : null,
      amountCents: take,
      createdBy: found(ctx.viewer ?? undefined).accountId,
    })
    left -= take
    ctx.notify([{ topic: `${source.type}:${source.id}`, version: null }])
    if (!left) break
  }
}
export function notifyCreditSources(ctx: WriteContext, uses: (typeof creditUses.$inferSelect)[]) {
  for (const u of uses) {
    if (u.sourceReceiptId !== null)
      ctx.notify([{ topic: `receipt:${u.sourceReceiptId}`, version: null }])
    else if (u.sourcePaymentId !== null)
      ctx.notify([{ topic: `payment:${u.sourcePaymentId}`, version: null }])
    else if (u.sourceStatementId !== null)
      ctx.notify([{ topic: `statement:${u.sourceStatementId}`, version: null }])
  }
}
