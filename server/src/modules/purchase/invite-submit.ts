import { appError, contract, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { invites, inviteSupplyLines, materials, purchaseOrders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { insertPoLines, lockSupplier, materialSnapshots, notifyPo } from './purchase-common.ts'
import { inviteLog, lockInvite, notifyInvite, type InviteRow } from './invite-common.ts'
import { InviteReads } from './invite-reads.ts'
import { PoReads } from './po-reads.ts'

type Supply = ParsedInput<typeof contract.submitSupplierInvite>['body']
@Injectable()
export class InviteSubmission {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: InviteReads,
    private readonly po: PoReads,
    private readonly clock: Clock,
  ) {}
  submit(viewer: Viewer, id: number, input: Supply, key: string) {
    return this.writes.run(viewer, (ctx) => this.submitInTx(ctx, id, input), {
      endpoint: contract.submitSupplierInvite,
      key,
    })
  }
  private async submitInTx(ctx: WriteContext, id: number, input: Supply) {
    const viewer = found(ctx.viewer ?? undefined)
    // 所有供应商状态变更先锁供应商，再锁邀请。
    await lockSupplier(ctx.tx, viewer.supplierId ?? 0, true)
    const invite = await lockInvite(ctx.tx, viewer, id)
    const current = await this.reads.detail(ctx.tx, viewer, id)
    gateAction(current, {
      code: 'submitSupply',
      version: input.version,
      missing:
        invite.status === 'cancelled'
          ? copy.finance.inviteCancelledStale
          : copy.finance.inviteLinkExpired,
      stale: copy.finance.inviteStale,
    })
    const ids = [...new Set(input.lines.map((line) => Number(line.materialId)))]
    const mats = await ctx.tx
      .select()
      .from(materials)
      .where(inArray(materials.id, ids))
      .orderBy(asc(materials.id))
      .for('share')
    if (mats.some((row) => !row.enabled))
      throw appError.businessRule(copy.finance.inviteMaterialDisabled)
    if (input.lines.length === 0) throw appError.businessRule(copy.finance.inviteAllZero)
    const po = await this.generate(ctx, invite, input.lines)
    await ctx.tx
      .update(invites)
      .set({
        status: 'submitted',
        submittedAt: this.clock.now(),
        version: sql`${invites.version} + 1`,
      })
      .where(eq(invites.id, id))
    await ctx.log(inviteLog(invite, copy.log.action.submitSupply))
    notifyInvite(ctx, { ...invite, version: invite.version + 1 })
    notifyPo(ctx, po)
    return {
      invite: await this.reads.detail(ctx.tx, viewer, id),
      purchaseOrder: this.po.supplierView(await this.po.detail(ctx.tx, viewer, po.id)),
    }
  }
  private async generate(ctx: WriteContext, invite: InviteRow, lines: Supply['lines']) {
    const actor = found(ctx.viewer ?? undefined)
    const mats = await materialSnapshots(
      ctx.tx,
      lines.map((line) => line.materialId),
    )
    const [row] = await ctx.tx
      .insert(purchaseOrders)
      .values({
        no: await ctx.nextDocNo('PO'),
        orderDate: this.clock.today(),
        supplierId: invite.supplierId,
        buyerId: invite.buyerId,
        inviteId: invite.id,
        createdBy: actor.accountId,
      })
      .returning()
    const po = found(row)
    await insertPoLines(ctx, po.id, lines)
    await ctx.tx.insert(inviteSupplyLines).values(
      lines.map((line, sort) => ({
        inviteId: invite.id,
        materialId: Number(line.materialId),
        name: found(mats[sort]).name,
        unit: found(mats[sort]).unit,
        qty: line.qty,
        priceCents: line.priceCents,
        sort,
        createdBy: actor.accountId,
      })),
    )
    return po
  }
}
