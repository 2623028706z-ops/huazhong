import { appError, contract, copy } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { invites, operationLogs } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { inviteLog, lockInvite } from './invite-common.ts'
import { InviteSigning } from './invite-signing.ts'

@Injectable()
export class InviteLinks {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly signing: InviteSigning,
  ) {}
  share(viewer: Viewer, id: number) {
    return this.writes.run(viewer, async (ctx) => {
      const invite = await lockInvite(ctx.tx, viewer, id)
      if (invite.status !== 'pending') throw appError.businessRule(copy.finance.inviteLinkExpired)
      // 进页面就取卡片参数：同一邀请只在第一次生成时记一条日志（邀请行已加锁，不会并发重复）
      const [logged] = await ctx.tx
        .select({ id: operationLogs.id })
        .from(operationLogs)
        .where(
          and(
            eq(operationLogs.targetType, 'invites'),
            eq(operationLogs.targetId, id),
            eq(operationLogs.action, copy.log.action.shareInvite),
          ),
        )
        .limit(1)
      if (logged) ctx.unchanged()
      else await ctx.log(inviteLog(invite, copy.log.action.shareInvite))
      return {
        path: `pages/link/index?t=invite&id=${id}&sig=${this.signing.sign(String(id))}`,
        title: copy.finance.inviteShareTitle,
        imageUrl: '/assets/logo.png',
      }
    })
  }
  async resolve(viewer: Viewer, input: ParsedInput<typeof contract.resolveSupplierInvite>['body']) {
    if (!this.signing.verify(input.id, input.sig))
      throw appError.businessRule(copy.finance.inviteLinkInvalid)
    const [row] = await this.db
      .select()
      .from(invites)
      .where(eq(invites.id, Number(input.id)))
    const invite = found(row)
    if (viewer.type !== 'supplier' || viewer.supplierId !== invite.supplierId)
      throw appError.forbidden(copy.finance.inviteNotYours)
    if (invite.status !== 'pending') throw appError.businessRule(copy.finance.inviteLinkExpired)
    return { inviteId: String(invite.id) }
  }
}
