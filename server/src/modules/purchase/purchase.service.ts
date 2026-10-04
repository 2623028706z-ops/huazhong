// 跨模块只从这里取采购单、锁定单据和发送变更通知。
import {
  redesignCopy,
  STOCK_AGE_WARNING_DAYS,
  type contract,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, count, countDistinct, eq, gt, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { invites, purchaseOrders, stockBatches } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { PoReads } from './po-reads.ts'
import { lockPo, notifyPo } from './purchase-common.ts'

@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly po: PoReads,
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
  async purchaseTodos(_viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const [invite] = await this.db
      .select({ n: count() })
      .from(invites)
      .where(eq(invites.status, 'pending'))
    const [po] = await this.db
      .select({ n: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'to_receive'))
    const rows = [
      { key: 'pendingInvites', label: redesignCopy.pendingInviteTodo, count: invite?.n ?? 0 },
      { key: 'pendingPurchaseOrders', label: redesignCopy.pendingPoTodo, count: po?.n ?? 0 },
    ]
    return { count: rows.reduce((n, row) => n + row.count, 0), rows }
  }
  async warehouseTodos(_viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const [po] = await this.db
      .select({ n: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.status, 'to_receive'))
    const [aged] = await this.db
      .select({ n: countDistinct(stockBatches.materialId) })
      .from(stockBatches)
      .where(
        and(
          gt(stockBatches.leftQty, 0),
          sql`${stockBatches.inDate} <= ${this.clock.today()}::date - ${STOCK_AGE_WARNING_DAYS}`,
        ),
      )
    const rows = [
      { key: 'pendingReceives', label: redesignCopy.toReceive, count: po?.n ?? 0 },
      { key: 'agedStock', label: redesignCopy.agedCount, count: aged?.n ?? 0 },
    ]
    return { count: rows.reduce((n, row) => n + row.count, 0), rows }
  }
}
