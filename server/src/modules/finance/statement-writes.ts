import {
  appError,
  contract,
  statementCopy,
  type StatementCreate,
  type StatementKind,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import {
  customers,
  suppliers,
  statements,
  statementLines,
  creditUses,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import {
  lockParty,
  useCredit,
  notifyStatement,
  notifyCreditSources,
} from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { StatementReads } from './statement-reads.ts'
import {
  lockSelected,
  selectedSources,
  insertStatement,
  assertVoidAllowed,
  validateTerms,
} from './statement-commands.ts'
@Injectable()
export class StatementWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: StatementReads,
    private readonly clock: Clock,
  ) {}
  async create(viewer: Viewer, input: StatementCreate, key: string) {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const party = await lockParty(ctx.tx, input.kind, Number(input.partyId))
        await lockSelected(ctx.tx, input)
        const latest = await this.reads.draft(ctx.tx, input.kind, party.id, {
          from: input.periodFrom,
          to: input.periodTo,
        })
        if (party.version !== input.partyVersion || latest.creditCents !== input.creditCents)
          throw appError.stale(statementCopy.partyStale, latest)
        const sources = await selectedSources(ctx.tx, input, latest)
        const saved = await insertStatement(ctx, input, { party, latest, sources }, this.clock)
        if (saved.creditDeductedCents)
          await useCredit(ctx, {
            kind: input.kind,
            partyId: party.id,
            amount: saved.creditDeductedCents,
            target: { statementId: saved.id },
          })
        await ctx.log({
          module: 'finance',
          kind: statementCopy.statement,
          action: statementCopy.statementCreate,
          targetType: 'statements',
          targetId: saved.id,
          targetLabel: saved.no,
        })
        await notifyStatement(ctx, saved.id)
        return this.reads.detail(ctx.tx, saved.id, viewer)
      },
      { endpoint: contract.createStatement, key },
    )
  }
  async void(viewer: Viewer, id: number, input: { version: number; reason: string }) {
    return this.writes.run(viewer, async (ctx) => {
      const before = found((await ctx.tx.select().from(statements).where(eq(statements.id, id)))[0])
      await lockParty(ctx.tx, before.kind, before.customerId ?? before.supplierId ?? 0)
      const row = found(
          (await ctx.tx.select().from(statements).where(eq(statements.id, id)).for('update'))[0],
        ),
        latest = await this.reads.detail(ctx.tx, id, viewer)
      if (row.version !== input.version || row.status === 'voided')
        throw appError.stale(statementCopy.statementStale, latest)
      assertVoidAllowed(latest)
      await ctx.tx
        .update(statements)
        .set({
          status: 'voided',
          version: row.version + 1,
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: this.clock.now(),
        })
        .where(and(eq(statements.id, id), eq(statements.version, input.version)))
      await ctx.tx
        .update(statementLines)
        .set({ releasedAt: this.clock.now() })
        .where(and(eq(statementLines.statementId, id), isNull(statementLines.releasedAt)))
      const released = await ctx.tx
        .update(creditUses)
        .set({ releasedAt: this.clock.now() })
        .where(and(eq(creditUses.statementId, id), isNull(creditUses.releasedAt)))
        .returning()
      notifyCreditSources(ctx, released)
      await ctx.log({
        module: 'finance',
        kind: statementCopy.statement,
        action: statementCopy.statementVoid,
        targetType: 'statements',
        targetId: id,
        targetLabel: row.no,
        reason: input.reason,
      })
      await notifyStatement(ctx, id)
      return this.reads.detail(ctx.tx, id, viewer)
    })
  }
  async terms(
    viewer: Viewer,
    partyRef: { kind: StatementKind; id: number },
    input: { version: number; termDays: number | null; openingDebtCents?: number | undefined },
  ) {
    return this.writes.run(viewer, async (ctx) => {
      const { kind, id } = partyRef,
        party = await lockParty(ctx.tx, kind, id),
        latest = await this.reads.terms(ctx.tx, kind, id)
      if (party.version !== input.version) throw appError.stale(statementCopy.termsStale, latest)
      const openingDebtCents = validateTerms(party, latest, input),
        table = kind === 'customer' ? customers : suppliers
      await ctx.tx
        .update(table)
        .set({ version: party.version + 1, termDays: input.termDays, openingDebtCents })
        .where(eq(table.id, id))
      await ctx.log({
        module: 'finance',
        kind: statementCopy.terms,
        action: statementCopy.editTerms,
        targetType: kind === 'customer' ? 'customers' : 'suppliers',
        targetId: id,
        targetLabel: party.name,
        before: {
          账期: String(party.termDays ?? statementCopy.notSet),
          期初欠款: String(party.openingDebtCents),
        },
        after: {
          账期: String(input.termDays ?? statementCopy.notSet),
          期初欠款: String(openingDebtCents),
        },
      })
      ctx.notify([{ topic: kind === 'customer' ? `ar:${id}` : `ap:${id}`, version: null }])
      return this.reads.terms(ctx.tx, kind, id)
    })
  }
}
