import { copy } from '@huazhong/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import { invites } from '../../../db/schema/index.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { inviteLog, notifyInvite } from './invite-common.ts'

export async function cancelSupplierInvites(
  ctx: WriteContext,
  id: number,
  note: string,
  now: Date,
) {
  const rows = await ctx.tx
    .select()
    .from(invites)
    .where(and(eq(invites.supplierId, id), eq(invites.status, 'pending')))
    .orderBy(asc(invites.id))
    .for('update')
  for (const row of rows) {
    await ctx.tx
      .update(invites)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: null,
        cancelNote: note,
        version: sql`${invites.version} + 1`,
      })
      .where(eq(invites.id, row.id))
    await ctx.log({ ...inviteLog(row, copy.log.action.cancelInvite), actor: null, reason: note })
    notifyInvite(ctx, { ...row, version: row.version + 1 })
  }
}
