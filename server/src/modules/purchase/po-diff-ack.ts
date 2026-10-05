// 下单采购员（或管理员）点「知道了」：记已看过到货差异（2026-10-06 第 3 批）
import { appError, copy, noticeCopy, type PoDetail } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { purchaseOrders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { owns } from '../../common/statements.ts'
import { diffUnseenOf } from './po-diff.ts'
import { PoReads } from './po-reads.ts'

@Injectable()
export class PoDiffAck {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: PoReads,
    private readonly clock: Clock,
  ) {}

  // 只记看过，不改版本号（不打断仓库正在改价、退货）；已经看过的重复点直接返回详情
  ack(viewer: Viewer, id: number, input: { version: number }): Promise<PoDetail> {
    return this.writes.run(viewer, async (ctx) => {
      const [row] = await ctx.tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, id))
        .for('update')
      const po = found(row)
      if (!owns(viewer, po.buyerId)) throw appError.forbidden()
      if (po.version !== input.version)
        throw appError.stale(noticeCopy.poDiffStale, await this.reads.detail(ctx.tx, viewer, id))
      if (diffUnseenOf(po)) {
        await ctx.tx
          .update(purchaseOrders)
          .set({ buyerSeenAt: this.clock.now(), buyerSeenBy: viewer.accountId })
          .where(eq(purchaseOrders.id, id))
        await ctx.log({
          module: 'purchase',
          kind: copy.log.kind.purchaseOrder,
          action: noticeCopy.poDiffAckLog,
          targetType: 'purchase_orders',
          targetId: id,
          targetLabel: po.no,
        })
        ctx.notify([
          { topic: `po:${id}`, version: po.version },
          { topic: 'pos', version: null },
          { topic: 'todo:purchase', version: null },
        ])
      } else ctx.unchanged()
      return this.reads.detail(ctx.tx, viewer, id)
    })
  }
}
