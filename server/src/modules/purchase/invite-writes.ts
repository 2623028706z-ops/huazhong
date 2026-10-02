import { appError, contract, copy, labels } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { inviteLines, invites } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { PurchaseDemand } from './demand.ts'
import { lockSupplier, materialSnapshots } from './purchase-common.ts'
import { InviteReads } from './invite-reads.ts'
import { inviteLog, lockInvite, notifyInvite } from './invite-common.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>['body']
async function insertLines(
  ctx: WriteContext,
  inviteId: number,
  lines: In<'createInvite'>['lines'],
) {
  const mats = await materialSnapshots(
    ctx.tx,
    lines.map((line) => line.materialId),
  )
  await ctx.tx.insert(inviteLines).values(
    lines.map((line, sort) => ({
      inviteId,
      materialId: Number(line.materialId),
      name: found(mats[sort]).name,
      unit: found(mats[sort]).unit,
      needQty: line.needQty,
      sort,
      createdBy: ctx.viewer?.accountId ?? 0,
    })),
  )
}
function inviteView(lines: readonly { name: string; needQty: number; unit: string }[]) {
  return lines.map((line) => `${line.name} ${line.needQty} ${line.unit}`).join(copy.separator)
}

@Injectable()
export class InviteWrites {
  constructor(
    private readonly demand: PurchaseDemand,
    private readonly writes: WriteService,
    private readonly reads: InviteReads,
    private readonly clock: Clock,
  ) {}

  create(viewer: Viewer, input: In<'createInvite'>, key: string) {
    return this.writes.run(
      viewer,
      async (ctx) => {
        await lockSupplier(ctx.tx, Number(input.supplierId), true)
        await this.demand.assertReview(ctx, input, 'invite')
        const [row] = await ctx.tx
          .insert(invites)
          .values({
            no: await ctx.nextDocNo('YQ'),
            inviteDate: this.clock.today(),
            supplierId: Number(input.supplierId),
            buyerId: viewer.accountId,
            createdBy: viewer.accountId,
          })
          .returning()
        const invite = found(row)
        await insertLines(ctx, invite.id, input.lines)
        const detail = await this.reads.detail(ctx.tx, viewer, invite.id)
        await ctx.log({
          ...inviteLog(invite, copy.log.action.createInvite),
          after: { [copy.records.poChange]: inviteView(detail.lines) },
        })
        notifyInvite(ctx, invite)
        return detail
      },
      { endpoint: contract.createInvite, key },
    )
  }
  update(viewer: Viewer, id: number, input: In<'updateInvite'>) {
    return this.writes.run(viewer, async (ctx) => {
      const invite = await lockInvite(ctx.tx, viewer, id)
      const before = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(before, {
        code: 'editInvite',
        version: input.version,
        missing: copy.finance.inviteStateLocked(labels.inviteStatus[invite.status]),
        stale: copy.finance.inviteStale,
      })
      const same =
        before.lines.length === input.lines.length &&
        before.lines.every(
          (line, index) =>
            line.materialId === found(input.lines[index]).materialId &&
            line.needQty === found(input.lines[index]).needQty,
        )
      if (same) throw appError.businessRule(copy.error.noChange)
      await ctx.tx.delete(inviteLines).where(eq(inviteLines.inviteId, id))
      await insertLines(ctx, id, input.lines)
      await ctx.tx
        .update(invites)
        .set({ version: sql`${invites.version} + 1` })
        .where(eq(invites.id, id))
      const after = await this.reads.detail(ctx.tx, viewer, id)
      await ctx.log({
        ...inviteLog(invite, copy.log.action.updateInvite),
        before: { [copy.records.poChange]: inviteView(before.lines) },
        after: { [copy.records.poChange]: inviteView(after.lines) },
      })
      notifyInvite(ctx, { ...invite, version: invite.version + 1 })
      return after
    })
  }
  cancel(viewer: Viewer, id: number, input: In<'cancelInvite'>) {
    return this.writes.run(viewer, async (ctx) => {
      const invite = await lockInvite(ctx.tx, viewer, id)
      const current = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(current, {
        code: 'cancelInvite',
        version: input.version,
        missing: copy.finance.inviteStateLocked(labels.inviteStatus[invite.status]),
        stale: copy.finance.inviteStale,
      })
      await ctx.tx
        .update(invites)
        .set({
          status: 'cancelled',
          cancelledBy: viewer.accountId,
          cancelledAt: this.clock.now(),
          version: sql`${invites.version} + 1`,
        })
        .where(eq(invites.id, id))
      await ctx.log(inviteLog(invite, copy.log.action.cancelInvite))
      notifyInvite(ctx, { ...invite, version: invite.version + 1 })
      return this.reads.detail(ctx.tx, viewer, id)
    })
  }
}
