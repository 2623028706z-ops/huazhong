import {
  appError,
  statementCopy,
  financeCopy,
  formatMoney,
  type ReceiptCreate,
  type PaymentCreate,
} from '@huazhong/shared'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import {
  receipts,
  payments,
  statements,
  settlementLinks,
  paymentMethods,
} from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { Clock } from '../../common/clock.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { exactNumber, sumOf } from '../../common/domain/units.ts'
import {
  lockParty,
  owns,
  notifyStatement,
  notifyCustomerFinance,
  notifySupplierFinance,
} from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { fundRow, fundDetails, type FundKind, type FundRow } from './fund-reads.ts'
import type { StatementReads } from './statement-reads.ts'
function selectedStatement(
  rows: (typeof statements.$inferSelect)[],
  selected: { id: string },
  party: { kind: 'customer' | 'supplier'; id: number },
) {
  const row = rows.find((s) => s.id === Number(selected.id))
  if (!row || row.kind !== party.kind || (row.customerId ?? row.supplierId) !== party.id)
    throw appError.notFound()
  return row
}
export async function method(tx: Tx, name: string) {
  const row = found(
    (await tx.select().from(paymentMethods).where(eq(paymentMethods.name, name)).for('share'))[0],
  )
  if (!row.enabled) throw appError.businessRule(statementCopy.methodDisabled)
}
export function date(clock: Clock, value: string, field: string) {
  if (value > clock.today()) throw appError.validation({ [field]: statementCopy.dateFuture(field) })
}
export async function notifyParty(ctx: WriteContext, kind: FundKind, id: number) {
  if (kind === 'receipt') await notifyCustomerFinance(ctx, id)
  else await notifySupplierFinance(ctx, id)
}
async function selection(
  ctx: WriteContext,
  input: ReceiptCreate | PaymentCreate,
  reads: StatementReads,
) {
  const partyId = 'customerId' in input ? Number(input.customerId) : Number(input.supplierId),
    kind = 'customerId' in input ? 'customer' : 'supplier',
    ids = input.statements.map((s) => Number(s.id)).sort((a, b) => a - b)
  const rows = ids.length
    ? await ctx.tx
        .select()
        .from(statements)
        .where(inArray(statements.id, ids))
        .orderBy(statements.id)
        .for('update')
    : []
  for (const selected of input.statements) {
    const row = selectedStatement(rows, selected, { kind, id: partyId })
    if (row.version !== selected.version || row.status !== 'unsettled')
      throw appError.stale(
        statementCopy.statementStale,
        await reads.unsettled(ctx.tx, found(ctx.viewer ?? undefined), kind, partyId),
      )
  }
  return rows
}
function creditAmount(
  input: ReceiptCreate | PaymentCreate,
  rows: (typeof statements.$inferSelect)[],
) {
  const total = sumOf(rows, (s) => s.dueCents)
  if (input.discountCents > total)
    throw appError.validation({ discountCents: statementCopy.discountOver })
  const funded = exactNumber(input.amountCents + input.discountCents)
  if (funded < total)
    throw appError.businessRule(financeCopy.insufficient(formatMoney(total - funded)))
  return funded - total
}
async function insertFund(
  ctx: WriteContext,
  kind: FundKind,
  input: ReceiptCreate | PaymentCreate,
  creditCents: number,
) {
  const fields = {
    no: await ctx.nextDocNo(kind === 'receipt' ? 'SK' : 'FK'),
    amountCents: input.amountCents,
    discountCents: input.discountCents,
    discountReason: input.discountReason,
    creditCents,
    methodName: input.methodName,
    note: input.note,
    createdBy: found(ctx.viewer ?? undefined).accountId,
  }
  return 'customerId' in input
    ? found(
        (
          await ctx.tx
            .insert(receipts)
            .values({
              ...fields,
              customerId: Number(input.customerId),
              receiptDate: input.receiptDate,
            })
            .returning()
        )[0],
      )
    : found(
        (
          await ctx.tx
            .insert(payments)
            .values({ ...fields, supplierId: Number(input.supplierId), payDate: input.payDate })
            .returning()
        )[0],
      )
}
async function settle(
  ctx: WriteContext,
  fund: { kind: FundKind; id: number },
  rows: (typeof statements.$inferSelect)[],
  clock: Clock,
) {
  if (!rows.length) return
  await ctx.tx.insert(settlementLinks).values(
    rows.map((s) => ({
      statementId: s.id,
      receiptId: fund.kind === 'receipt' ? fund.id : null,
      paymentId: fund.kind === 'payment' ? fund.id : null,
      amountCents: s.dueCents,
      createdBy: found(ctx.viewer ?? undefined).accountId,
    })),
  )
  for (const s of rows) {
    await ctx.tx
      .update(statements)
      .set({ status: 'settled', settledAt: clock.now(), version: s.version + 1 })
      .where(eq(statements.id, s.id))
    await notifyStatement(ctx, s.id)
  }
}
export async function registerFund(
  ctx: WriteContext,
  input: ReceiptCreate | PaymentCreate,
  context: { kind: FundKind; clock: Clock; reads: StatementReads },
) {
  const { kind, clock, reads } = context,
    partyId = 'customerId' in input ? Number(input.customerId) : Number(input.supplierId),
    day = 'receiptDate' in input ? input.receiptDate : input.payDate
  await lockParty(ctx.tx, kind === 'receipt' ? 'customer' : 'supplier', partyId)
  date(clock, day, kind === 'receipt' ? 'receiptDate' : 'payDate')
  await method(ctx.tx, input.methodName)
  const rows = await selection(ctx, input, reads),
    saved = await insertFund(ctx, kind, input, creditAmount(input, rows))
  await settle(ctx, { kind, id: saved.id }, rows, clock)
  await fundLog(ctx, kind, saved, { operation: 'create' })
  ctx.notify([{ topic: `${kind}:${saved.id}`, version: saved.version }])
  await notifyParty(ctx, kind, partyId)
  return saved
}
async function fundLog(
  ctx: WriteContext,
  kind: FundKind,
  row: FundRow,
  input: { operation: 'create' | 'void'; reason?: string },
) {
  const { operation, reason } = input
  const action =
    operation === 'create'
      ? kind === 'receipt'
        ? statementCopy.registerReceipt
        : statementCopy.registerPayment
      : kind === 'receipt'
        ? statementCopy.voidReceipt
        : statementCopy.voidPayment
  await ctx.log({
    module: 'finance',
    kind: kind === 'receipt' ? statementCopy.receiptDetail : statementCopy.paymentDetail,
    action,
    targetType: kind === 'receipt' ? 'receipts' : 'payments',
    targetId: row.id,
    targetLabel: row.no,
    ...(reason === undefined ? {} : { reason }),
  })
}
async function lockSettlements(tx: Tx, kind: FundKind, id: number) {
  const links = await tx
    .select()
    .from(settlementLinks)
    .where(
      and(
        kind === 'receipt' ? eq(settlementLinks.receiptId, id) : eq(settlementLinks.paymentId, id),
        isNull(settlementLinks.reversedAt),
      ),
    )
  const ids = links.map((l) => l.statementId).sort((a, b) => a - b)
  if (ids.length)
    await tx
      .select()
      .from(statements)
      .where(inArray(statements.id, ids))
      .orderBy(statements.id)
      .for('update')
  return ids
}
async function reverse(
  ctx: WriteContext,
  fund: { kind: FundKind; id: number },
  ids: number[],
  clock: Clock,
) {
  await ctx.tx
    .update(settlementLinks)
    .set({ reversedAt: clock.now() })
    .where(
      and(
        fund.kind === 'receipt'
          ? eq(settlementLinks.receiptId, fund.id)
          : eq(settlementLinks.paymentId, fund.id),
        isNull(settlementLinks.reversedAt),
      ),
    )
  for (const id of ids) {
    await ctx.tx
      .update(statements)
      .set({ status: 'unsettled', settledAt: null, version: sql`${statements.version}+1` })
      .where(eq(statements.id, id))
    await notifyStatement(ctx, id)
  }
}
function checkVoid(
  row: FundRow,
  latest: Awaited<ReturnType<typeof fundDetails>>[number],
  input: { version: number },
  viewer: Viewer,
) {
  if (!owns(viewer, row.createdBy)) throw appError.forbidden(statementCopy.ownerOnly)
  if (row.version !== input.version || row.status !== 'valid')
    throw appError.stale(statementCopy.fundStale, latest)
  const action = latest.actions.find(
    (a) => a.code === ('customerId' in row ? 'voidReceipt' : 'voidPayment'),
  )
  if (!action?.enabled)
    throw appError.businessRule(action?.disabledReason ?? statementCopy.voidFundBlocked)
}
export async function voidFund(
  ctx: WriteContext,
  fund: { kind: FundKind; id: number; input: { version: number; reason: string } },
  clock: Clock,
) {
  const { kind, id, input } = fund,
    before = await fundRow(ctx.tx, fund),
    partyId = 'customerId' in before ? before.customerId : before.supplierId,
    viewer = found(ctx.viewer ?? undefined)
  await lockParty(ctx.tx, kind === 'receipt' ? 'customer' : 'supplier', partyId)
  const ids = await lockSettlements(ctx.tx, kind, id),
    row = await fundRow(ctx.tx, { kind, id, lock: true }),
    latest = found((await fundDetails(ctx.tx, kind, [row], viewer))[0])
  checkVoid(row, latest, input, viewer)
  const fields = {
    status: 'voided' as const,
    version: row.version + 1,
    voidReason: input.reason,
    voidedBy: viewer.accountId,
    voidedAt: clock.now(),
  }
  if (kind === 'receipt') await ctx.tx.update(receipts).set(fields).where(eq(receipts.id, id))
  else await ctx.tx.update(payments).set(fields).where(eq(payments.id, id))
  await reverse(ctx, fund, ids, clock)
  await fundLog(ctx, kind, row, { operation: 'void', reason: input.reason })
  await notifyParty(ctx, kind, partyId)
  ctx.notify([{ topic: `${kind}:${id}`, version: row.version + 1 }])
  return row.id
}
