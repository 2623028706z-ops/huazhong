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
import { purchaseOrders, stockBatches } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { PoReads } from './po-reads.ts'
import { PurchaseDemand } from './demand.ts'
import { lockPo, notifyPo } from './purchase-common.ts'

@Injectable()
export class PurchaseService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly po: PoReads,
    private readonly demand: PurchaseDemand,
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
  // 采购只有「缺货花材」该自己动手；待填报邀请、待收货采购单在等供应商 / 仓库，不进待办（03 章第 8.5 节）。
  // 口径同采购需求页：默认出货日期区间、余量为负的花材种数
  async purchaseTodos(_viewer: Viewer): Promise<OutputOf<typeof contract.moduleTodos>> {
    const shortage = (await this.demand.demand({ shortageOnly: true })).mats.length
    return {
      count: shortage,
      rows: [{ key: 'shortageMaterials', label: redesignCopy.shortageTodo, count: shortage }],
    }
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
          sql`${stockBatches.inDate} <= ${this.clock.today()}::date - ${STOCK_AGE_WARNING_DAYS}::int`,
        ),
      )
    const rows = [
      { key: 'pendingReceives', label: redesignCopy.toReceive, count: po?.n ?? 0 },
      { key: 'agedStock', label: redesignCopy.agedCount, count: aged?.n ?? 0 },
    ]
    return { count: rows.reduce((n, row) => n + row.count, 0), rows }
  }
}
