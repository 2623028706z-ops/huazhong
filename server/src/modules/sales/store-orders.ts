// 门店下单、改单、取消（05 章第 5 节）：单价取目录价，出货日期由销售定；先共享锁目录再锁订单
import {
  appError,
  contract,
  copy,
  type OrderDetail,
  type StoreOrderCreate,
  type StoreOrderUpdate,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { customers, orders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { diffOrder, orderLogView } from './domain/order-diff.ts'
import { orderableEntries } from './domain/order-rules.ts'
import {
  catalogEntriesOf,
  insertChange,
  lockCatalogShare,
  notifyOrder,
  orderLog,
  orderStateOf,
  orderVersionPlusOne,
  replaceLines,
  type NewLine,
} from './order-lines.ts'
import { orderDetailOf } from './order-query.ts'
import { lockOrder } from './order-rows.ts'

// 门店账号一定有门店和客户（accounts_store_link + stores.customer_id NOT NULL）
function storeScope(viewer: Viewer): { storeId: number; customerId: number } {
  if (viewer.storeId === null || viewer.customerId === null) throw appError.internal()
  return { storeId: viewer.storeId, customerId: viewer.customerId }
}

@Injectable()
export class StoreOrderWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}

  private detail(ctx: WriteContext, viewer: Viewer, id: number): Promise<OrderDetail> {
    return orderDetailOf(ctx.tx, viewer, id, this.clock.today())
  }

  // 所有行按当前目录价（单价、目录价快照）；停订、停用的产品拦住
  private async linesOf(
    ctx: WriteContext,
    customerId: number,
    input: StoreOrderCreate,
  ): Promise<NewLine[]> {
    const ids = input.lines.map((line) => Number(line.productId))
    const entries = orderableEntries(
      ids,
      await catalogEntriesOf(ctx.tx, customerId, ids),
      copy.order.discontinuedSubmit,
    )
    return input.lines.map((line, index) => {
      const entry = entries[index]
      if (!entry) throw appError.internal()
      return { ...entry, qty: line.qty, priceCents: entry.listPriceCents }
    })
  }

  private async assertCustomerEnabled(ctx: WriteContext, customerId: number, message: string) {
    const [customer] = await ctx.tx
      .select({ enabled: customers.enabled })
      .from(customers)
      .where(eq(customers.id, customerId))
    if (!customer?.enabled) throw appError.businessRule(message)
  }

  create(viewer: Viewer, input: StoreOrderCreate, idempotencyKey: string): Promise<OrderDetail> {
    const { storeId, customerId } = storeScope(viewer)
    return this.writes.run(
      viewer,
      async (ctx) => {
        await this.assertCustomerEnabled(ctx, customerId, copy.store.customerDisabled)
        await lockCatalogShare(ctx.tx, customerId)
        const lines = await this.linesOf(ctx, customerId, input)
        const [row] = await ctx.tx
          .insert(orders)
          .values({
            no: await ctx.nextDocNo('SO'),
            orderDate: this.clock.today(),
            shipDate: null,
            customerId,
            storeId,
            status: 'pending_confirm',
            origin: 'store',
            note: input.note,
            createdBy: viewer.accountId,
          })
          .returning({ id: orders.id, createdBy: orders.createdBy })
        if (!row) throw appError.internal()
        await replaceLines(ctx.tx, row, lines)
        const detail = await this.detail(ctx, viewer, row.id)
        await ctx.log({
          ...orderLog(detail, copy.log.action.storeOrder),
          after: orderLogView(orderStateOf(detail)),
        })
        notifyOrder(ctx, detail, ['todo:sales'])
        return detail
      },
      { endpoint: contract.createStoreOrder, key: idempotencyKey },
    )
  }

  // 内容没变不写变更记录，直接返回
  update(viewer: Viewer, id: number, input: StoreOrderUpdate): Promise<OrderDetail> {
    const { customerId } = storeScope(viewer)
    return this.writes.run(viewer, async (ctx) => {
      await lockCatalogShare(ctx.tx, customerId)
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      gateAction(before, {
        code: 'storeEdit',
        version: input.version,
        missing:
          before.status === 'cancelled'
            ? copy.order.cancelledStale
            : copy.order.confirmedStoreStale,
        stale: copy.order.stale,
      })
      const lines = await this.linesOf(ctx, customerId, input)
      const beforeState = orderStateOf(before)
      const afterState = { ...beforeState, note: input.note, lines }
      const items = diffOrder(beforeState, afterState)
      if (items.length === 0) {
        ctx.unchanged()
        return before
      }
      await ctx.tx
        .update(orders)
        .set({ note: input.note, version: orderVersionPlusOne })
        .where(eq(orders.id, id))
      await replaceLines(ctx.tx, { id, createdBy: viewer.accountId }, lines)
      await insertChange(ctx, id, items)
      const detail = await this.detail(ctx, viewer, id)
      await ctx.log({
        ...orderLog(detail, copy.log.action.storeEdit),
        before: orderLogView(beforeState),
        after: orderLogView(afterState),
      })
      notifyOrder(ctx, detail, ['todo:sales'])
      return detail
    })
  }

  cancel(viewer: Viewer, id: number, version: number): Promise<OrderDetail> {
    return this.writes.run(viewer, async (ctx) => {
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      gateAction(before, {
        code: 'storeCancel',
        version,
        missing:
          before.status === 'cancelled'
            ? copy.order.cancelledAlready
            : copy.order.confirmedStoreCancel,
        stale: copy.order.stale,
      })
      await ctx.tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelledBy: viewer.accountId,
          cancelledAt: this.clock.now(),
          version: orderVersionPlusOne,
        })
        .where(eq(orders.id, id))
      const detail = await this.detail(ctx, viewer, id)
      await ctx.log(orderLog(detail, copy.log.action.storeCancel))
      notifyOrder(ctx, detail, ['todo:sales'])
      return detail
    })
  }
}
