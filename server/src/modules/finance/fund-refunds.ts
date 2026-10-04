import {
  appError,
  statementCopy,
  financeCopy,
  formatMoney,
  type RefundDetail,
  type contract,
  type InputOf,
} from '@huazhong/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { refunds, creditUses } from '../../../db/schema/index.ts'
import type { WriteContext } from '../../common/write.service.ts'
import type { Clock } from '../../common/clock.ts'
import { sumOf } from '../../common/domain/units.ts'
import {
  creditSources,
  lockParty,
  owns,
  useCredit,
  notifyCreditSources,
} from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { refundView } from './refund-reads.ts'
import { date, method, notifyParty } from './fund-commands.ts'
type RefundInput = InputOf<typeof contract.createRefund>
export async function registerRefund(ctx: WriteContext, input: RefundInput['body'], clock: Clock) {
  const partyId = Number(input.kind === 'receipt' ? input.customerId : input.supplierId),
    kind = input.kind === 'receipt' ? 'customer' : 'supplier'
  await lockParty(ctx.tx, kind, partyId)
  date(clock, input.refundDate, 'refundDate')
  await method(ctx.tx, input.methodName)
  const balance = sumOf(await creditSources(ctx.tx, kind, partyId), (s) => s.balance)
  if (input.amountCents > balance)
    throw appError.businessRule(financeCopy.maxRefund(formatMoney(balance)))
  const row = found(
    (
      await ctx.tx
        .insert(refunds)
        .values({
          kind: input.kind,
          customerId: kind === 'customer' ? partyId : null,
          supplierId: kind === 'supplier' ? partyId : null,
          no: await ctx.nextDocNo('TK'),
          refundDate: input.refundDate,
          amountCents: input.amountCents,
          methodName: input.methodName,
          note: input.note,
          createdBy: found(ctx.viewer ?? undefined).accountId,
        })
        .returning()
    )[0],
  )
  await useCredit(ctx, { kind, partyId, amount: input.amountCents, target: { refundId: row.id } })
  await ctx.log({
    module: 'finance',
    kind: statementCopy.refund,
    action: kind === 'customer' ? statementCopy.refundCredit : statementCopy.refundSupplierCredit,
    targetType: 'refunds',
    targetId: row.id,
    targetLabel: row.no,
  })
  await notifyParty(ctx, input.kind, partyId)
  return refundView(ctx.tx, row, found(ctx.viewer ?? undefined))
}
function checkRefund(
  row: typeof refunds.$inferSelect,
  latest: RefundDetail,
  input: { version: number },
  ctx: WriteContext,
) {
  if (!owns(ctx.viewer ?? undefined, row.createdBy))
    throw appError.forbidden(statementCopy.ownerOnly)
  if (row.version !== input.version || row.status !== 'valid')
    throw appError.stale(statementCopy.refundStale, latest)
}
export async function voidRefund(
  ctx: WriteContext,
  id: number,
  input: { version: number; reason: string },
  clock: Clock,
) {
  const before = found((await ctx.tx.select().from(refunds).where(eq(refunds.id, id)))[0]),
    partyId = before.customerId ?? before.supplierId ?? 0,
    viewer = found(ctx.viewer ?? undefined)
  await lockParty(ctx.tx, before.kind === 'receipt' ? 'customer' : 'supplier', partyId)
  const row = found(
    (await ctx.tx.select().from(refunds).where(eq(refunds.id, id)).for('update'))[0],
  )
  checkRefund(row, await refundView(ctx.tx, row, viewer), input, ctx)
  const saved = found(
    (
      await ctx.tx
        .update(refunds)
        .set({
          status: 'voided',
          version: row.version + 1,
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: clock.now(),
        })
        .where(eq(refunds.id, id))
        .returning()
    )[0],
  )
  const uses = await ctx.tx
    .update(creditUses)
    .set({ releasedAt: clock.now() })
    .where(and(eq(creditUses.refundId, id), isNull(creditUses.releasedAt)))
    .returning()
  notifyCreditSources(ctx, uses)
  await ctx.log({
    module: 'finance',
    kind: statementCopy.refund,
    action: statementCopy.voidRefund,
    targetType: 'refunds',
    targetId: id,
    targetLabel: row.no,
    reason: input.reason,
  })
  await notifyParty(ctx, row.kind, partyId)
  return refundView(ctx.tx, saved, viewer)
}
