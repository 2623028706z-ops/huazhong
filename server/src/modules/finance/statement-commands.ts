import {
  appError,
  statementCopy,
  type StatementCreate,
  type StatementSource,
  type StatementDetail,
} from '@huazhong/shared'
import { inArray } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import {
  statements,
  statementLines,
  orders,
  afters,
  purchaseOrders,
  whDocs,
} from '../../../db/schema/index.ts'
import type { customers } from '../../../db/schema/index.ts'
import type { Clock } from '../../common/clock.ts'
import type { WriteContext } from '../../common/write.service.ts'
import type { StatementReads } from './statement-reads.ts'
import { sourceParty } from './sources.ts'
import { exactNumber, sumOf } from '../../common/domain/units.ts'
import { found } from '../../common/scope.ts'
type Draft = Awaited<ReturnType<StatementReads['draft']>>
type Party = Pick<typeof customers.$inferSelect, 'id' | 'termDays'>
const MAX_CALENDAR_YEAR = 9999
const ISO_DATE_LENGTH = 10
function dayAfter(date: string, days: number) {
  const value = new Date(date + 'T00:00:00.000Z')
  value.setUTCDate(value.getUTCDate() + days)
  if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() > MAX_CALENDAR_YEAR)
    throw appError.validation({ termDays: statementCopy.termRange })
  return value.toISOString().slice(0, ISO_DATE_LENGTH)
}
export async function lockSelected(tx: Tx, input: StatementCreate) {
  for (const type of ['order', 'after', 'po', 'wh'] as const) {
    const ids = input.sources
      .filter((s) => s.type === type)
      .map((s) => Number(s.id))
      .sort((a, b) => a - b)
    if (!ids.length) continue
    const table =
      type === 'order'
        ? orders
        : type === 'after'
          ? afters
          : type === 'po'
            ? purchaseOrders
            : whDocs
    await tx
      .select({ id: table.id })
      .from(table)
      .where(inArray(table.id, ids))
      .orderBy(table.id)
      .for('update')
  }
}
export async function selectedSources(tx: Tx, input: StatementCreate, latest: Draft) {
  const selected = await Promise.all(
    input.sources.map(async (s) => {
      const current = latest.sources.find((c) => c.type === s.type && c.id === s.id)
      if (!current) {
        const owner = await sourceParty(tx, s.type, Number(s.id))
        if (!owner || owner.kind !== input.kind || owner.id !== Number(input.partyId))
          throw appError.notFound()
        throw appError.stale(statementCopy.sourceStale, latest)
      }
      if (current.version !== (s.version ?? null) || current.amountCents !== s.amountCents)
        throw appError.stale(statementCopy.sourceStale, latest)
      return current
    }),
  )
  const economic = selected.filter((s) => s.carriesAmount)
  if (!economic.length && !latest.openingDebtCents)
    throw appError.businessRule(statementCopy.sourceRequired)
  const parents = new Set(economic.map((s) => `${s.type}:${s.id}`))
  const evidence = latest.sources.filter(
    (s) => !s.carriesAmount && parents.has(`${s.parentType ?? ''}:${s.parentId ?? ''}`),
  )
  return [...economic, ...evidence]
}
function amounts(latest: Draft, sources: StatementSource[]) {
  const grossCents = sumOf(
      sources.filter((s) => s.carriesAmount),
      (s) => s.amountCents,
    ),
    raw = exactNumber(grossCents + latest.openingDebtCents),
    creditDeductedCents = Math.min(latest.creditCents, Math.max(raw, 0))
  return {
    grossCents,
    openingDebtCents: latest.openingDebtCents,
    creditDeductedCents,
    dueCents: Math.max(raw - creditDeductedCents, 0),
    creditGeneratedCents: Math.max(-raw, 0),
  }
}
async function insertLines(ctx: WriteContext, id: number, sources: StatementSource[]) {
  if (sources.length)
    await ctx.tx.insert(statementLines).values(
      sources.map((s, sort) => ({
        statementId: id,
        sourceType: s.type,
        sourceId: Number(s.id),
        sourceVersion: s.version,
        parentType: s.parentType ?? null,
        parentId: s.parentId === undefined ? null : Number(s.parentId),
        sourceNo: s.sourceNo,
        sourceDate: s.sourceDate,
        storeId: s.storeId === null ? null : Number(s.storeId),
        storeName: s.storeName,
        amountCents: s.amountCents,
        carriesAmount: s.carriesAmount,
        previousPeriod: s.previousPeriod,
        sort,
        createdBy: found(ctx.viewer ?? undefined).accountId,
      })),
    )
}
export async function insertStatement(
  ctx: WriteContext,
  input: StatementCreate,
  data: { party: Party; latest: Draft; sources: StatementSource[] },
  clock: Clock,
) {
  const totals = amounts(data.latest, data.sources)
  const row = found(
    (
      await ctx.tx
        .insert(statements)
        .values({
          no: await ctx.nextDocNo('DZ'),
          kind: input.kind,
          customerId: input.kind === 'customer' ? data.party.id : null,
          supplierId: input.kind === 'supplier' ? data.party.id : null,
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          statementDate: clock.today(),
          dueDate:
            data.party.termDays === null ? null : dayAfter(clock.today(), data.party.termDays),
          note: input.note,
          ...totals,
          status: totals.dueCents === 0 ? 'settled' : 'unsettled',
          settledAt: totals.dueCents === 0 ? clock.now() : null,
          createdBy: found(ctx.viewer ?? undefined).accountId,
        })
        .returning()
    )[0],
  )
  await insertLines(ctx, row.id, data.sources)
  return row
}
export function assertVoidAllowed(latest: StatementDetail) {
  const action = latest.actions.find((a) => a.code === 'voidStatement')
  if (!action?.enabled)
    throw appError.businessRule(action?.disabledReason ?? statementCopy.voidStatementBlocked)
}
export function validateTerms(
  party: { termDays: number | null; openingDebtCents: number },
  latest: { openingDebtEditable: boolean },
  input: { termDays: number | null; openingDebtCents?: number | undefined },
) {
  if (
    !latest.openingDebtEditable &&
    input.openingDebtCents !== undefined &&
    input.openingDebtCents !== party.openingDebtCents
  )
    throw appError.businessRule(statementCopy.openingLocked)
  const openingDebtCents = input.openingDebtCents ?? party.openingDebtCents
  if (input.termDays === party.termDays && openingDebtCents === party.openingDebtCents)
    throw appError.businessRule(statementCopy.noChanges)
  return openingDebtCents
}
