import { copy } from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import { invites } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import type { WriteContext } from '../../common/write.service.ts'

export type InviteRow = typeof invites.$inferSelect
export function inviteLog(row: { id: number; no: string }, action: string) {
  return {
    module: 'purchase' as const,
    kind: copy.log.kind.invite,
    action,
    targetType: 'invites',
    targetId: row.id,
    targetLabel: row.no,
  }
}
export function notifyInvite(ctx: WriteContext, row: InviteRow) {
  ctx.notify(
    [
      { topic: `invite:${row.id}`, version: row.version },
      { topic: 'invites', version: null },
      { topic: `supplier:${row.supplierId}`, version: null },
      { topic: 'demand', version: null },
    ],
    { supplierIds: [String(row.supplierId)] },
  )
}
export async function lockInvite(tx: Tx, viewer: Viewer, id: number) {
  const [row] = await tx
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, id),
        viewer.type === 'supplier' ? eq(invites.supplierId, viewer.supplierId ?? 0) : undefined,
      ),
    )
    .for('update')
  return found(row)
}
