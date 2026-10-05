// 门店「有结果还没看」（2026-10-06 第 3 批）：售后到了已处理 / 已关闭 / 已作废、取消申请被同意或拒绝，
// 门店打开那张详情就消。底栏「订单」角标 = 订单 + 售后；订单页两段的数字分别取
import { appError, contract, type OutputOf, type StoreUnseen } from '@huazhong/shared'
import { Controller, Inject, Injectable } from '@nestjs/common'
import { and, count, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { afters, orders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { unseenWhere } from '../../common/domain/seen.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { found, ownStoreId } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>

function storeOf(viewer: Viewer): number {
  const storeId = ownStoreId(viewer)
  if (storeId === null) throw appError.internal()
  return storeId
}

async function unseenCounts(executor: Db | Tx, storeId: number): Promise<StoreUnseen> {
  const [order] = await executor
    .select({ n: count() })
    .from(orders)
    .where(and(eq(orders.storeId, storeId), unseenWhere(orders.storeNoticeAt, orders.storeSeenAt)))
  const [after] = await executor
    .select({ n: count() })
    .from(afters)
    .where(and(eq(afters.storeId, storeId), unseenWhere(afters.storeNoticeAt, afters.storeSeenAt)))
  const n = { orders: order?.n ?? 0, afters: after?.n ?? 0 }
  return { ...n, total: n.orders + n.afters }
}

@Injectable()
export class StoreNotices {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}

  counts(viewer: Viewer): Promise<StoreUnseen> {
    return unseenCounts(this.db, storeOf(viewer))
  }

  // 只记看过时间，不改版本号、不写操作日志（不是业务变更）；不是本店的单 NOT_FOUND
  markOrder(viewer: Viewer, id: number): Promise<StoreUnseen> {
    const storeId = storeOf(viewer)
    return this.writes.run(viewer, async (ctx) => {
      const where = and(eq(orders.id, id), eq(orders.storeId, storeId))
      found((await ctx.tx.select({ id: orders.id }).from(orders).where(where))[0])
      await ctx.tx
        .update(orders)
        .set({ storeSeenAt: this.clock.now() })
        .where(and(where, unseenWhere(orders.storeNoticeAt, orders.storeSeenAt)))
      ctx.unchanged()
      return unseenCounts(ctx.tx, storeId)
    })
  }

  markAfter(viewer: Viewer, id: number): Promise<StoreUnseen> {
    const storeId = storeOf(viewer)
    return this.writes.run(viewer, async (ctx) => {
      const where = and(eq(afters.id, id), eq(afters.storeId, storeId))
      found((await ctx.tx.select({ id: afters.id }).from(afters).where(where))[0])
      await ctx.tx
        .update(afters)
        .set({ storeSeenAt: this.clock.now() })
        .where(and(where, unseenWhere(afters.storeNoticeAt, afters.storeSeenAt)))
      ctx.unchanged()
      return unseenCounts(ctx.tx, storeId)
    })
  }
}

@Controller()
export class StoreNoticesController {
  constructor(private readonly notices: StoreNotices) {}

  @Route(contract.storeUnseen)
  counts(@CurrentViewer() viewer: Viewer): Promise<OutputOf<typeof contract.storeUnseen>> {
    return this.notices.counts(viewer)
  }

  @Route(contract.markStoreOrderSeen)
  order(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'markStoreOrderSeen'>,
  ): Promise<OutputOf<typeof contract.markStoreOrderSeen>> {
    return this.notices.markOrder(viewer, Number(input.params.id))
  }

  @Route(contract.markStoreAfterSeen)
  after(
    @CurrentViewer() viewer: Viewer,
    @Input() input: In<'markStoreAfterSeen'>,
  ): Promise<OutputOf<typeof contract.markStoreAfterSeen>> {
    return this.notices.markAfter(viewer, Number(input.params.id))
  }
}
