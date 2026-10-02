// 跨模块只从这里取采购单、锁定单据和发送变更通知。
import { TODO_PREVIEW_COUNT, type contract, type OutputOf } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { invites, purchaseOrders } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { InviteReads } from './invite-reads.ts'
import { PoReads } from './po-reads.ts'
import { lockPo, notifyPo } from './purchase-common.ts'

@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly po: PoReads,
    private readonly invite: InviteReads,
  ) {}
  detail(executor: Db | Tx, viewer: Viewer, id: number) {
    return this.po.detail(executor, viewer, id)
  }
  cards(executor: Db | Tx, viewer: Viewer, where?: SQL) {
    return this.po.cards(executor, viewer, where)
  }
  lock(tx: Tx, id: number) {
    return lockPo(tx, id)
  }
  notify(
    ctx: WriteContext,
    row: { id: number; version: number; supplierId: number; inviteId?: number | null },
  ) {
    notifyPo(ctx, row)
  }
  async purchaseTodos(viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const cards = await this.invite.cards(this.db, viewer, eq(invites.status, 'pending'))
    return {
      count: cards.length,
      items: cards.slice(0, TODO_PREVIEW_COUNT).map((invite) => ({ kind: 'invite', invite })),
    }
  }
  async warehouseTodos(viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const cards = await this.po.cards(this.db, viewer, eq(purchaseOrders.status, 'to_receive'))
    cards.reverse()
    return {
      count: cards.length,
      items: cards
        .slice(0, TODO_PREVIEW_COUNT)
        .map((purchaseOrder) => ({ kind: 'purchaseOrder', purchaseOrder })),
    }
  }
}
