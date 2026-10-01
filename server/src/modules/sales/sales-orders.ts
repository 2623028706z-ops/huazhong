// 销售的订单写接口和确认发货（05 章第 4、6 节）：先锁订单，再按同一事务里的最新详情和 actions 判断
import {
  appError,
  contract,
  copy,
  type OrderCreate,
  type OrderDetail,
  type OrderShip,
  type OrderStatus,
  type OrderUpdate,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { customers, orderLines, orders, stores } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { namesText } from './domain/order-actions.ts'
import { diffOrder, orderLogView } from './domain/order-diff.ts'
import { orderableEntries, shippedQtysOf } from './domain/order-rules.ts'
import {
  catalogEntriesOf,
  insertChange,
  notifyOrder,
  orderLog,
  orderStateOf,
  orderVersionPlusOne,
  replaceLines,
  type NewLine,
} from './order-lines.ts'
import { orderDetailOf } from './order-query.ts'
import { lockOrder } from './order-rows.ts'

// 这张单已经不能做这个操作时的一句话（按现在的状态）
function closedMessage(status: OrderStatus): string {
  switch (status) {
    case 'pending_confirm':
    case 'to_ship':
      return copy.order.confirmedStale
    case 'shipped':
      return copy.order.shippedLocked
    case 'cancelled':
      return copy.order.cancelledAlready
  }
}

function shipMissing(status: OrderStatus): string {
  if (status === 'cancelled') return copy.order.shipCancelled
  if (status === 'shipped') return copy.order.shippedAlready
  return copy.order.shipChanged
}

@Injectable()
export class SalesOrderWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}

  private detail(ctx: WriteContext, viewer: Viewer, id: number): Promise<OrderDetail> {
    return orderDetailOf(ctx.tx, viewer, id, this.clock.today())
  }

  create(viewer: Viewer, input: OrderCreate, idempotencyKey: string): Promise<OrderDetail> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const [store] = await ctx.tx
          .select({ enabled: stores.enabled, customerEnabled: customers.enabled })
          .from(stores)
          .innerJoin(customers, eq(customers.id, stores.customerId))
          .where(
            and(
              eq(stores.id, Number(input.storeId)),
              eq(stores.customerId, Number(input.customerId)),
            ),
          )
        if (!store) throw appError.notFound()
        if (!store.customerEnabled) throw appError.businessRule(copy.order.customerDisabledNew)
        if (!store.enabled) throw appError.businessRule(copy.order.storeDisabledNew)
        const ids = input.lines.map((line) => Number(line.productId))
        const entries = orderableEntries(
          ids,
          await catalogEntriesOf(ctx.tx, Number(input.customerId), ids),
          copy.order.discontinuedSave,
        )
        const lines: NewLine[] = input.lines.map((line, index) => {
          const entry = entries[index]
          if (!entry) throw appError.internal()
          return { ...entry, qty: line.qty, priceCents: line.priceCents }
        })
        const detail = await this.insertOrder(ctx, viewer, input, lines)
        await ctx.log({
          ...orderLog(detail, copy.log.action.createOrder),
          after: orderLogView(orderStateOf(detail)),
        })
        notifyOrder(ctx, detail, ['todo:shipping'])
        return detail
      },
      { endpoint: contract.createOrder, key: idempotencyKey },
    )
  }

  confirm(
    viewer: Viewer,
    id: number,
    input: { version: number; shipDate: string },
  ): Promise<OrderDetail> {
    return this.writes.run(viewer, async (ctx) => {
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      gateAction(before, {
        code: 'confirm',
        version: input.version,
        missing: closedMessage(before.status),
        stale: copy.order.stale,
      })
      await ctx.tx
        .update(orders)
        .set({
          status: 'to_ship',
          shipDate: input.shipDate,
          confirmedBy: viewer.accountId,
          confirmedAt: this.clock.now(),
          version: orderVersionPlusOne,
        })
        .where(eq(orders.id, id))
      const detail = await this.detail(ctx, viewer, id)
      await ctx.log({
        ...orderLog(detail, copy.log.action.confirmOrder),
        after: { [copy.field.shipDate]: input.shipDate },
      })
      notifyOrder(ctx, detail, ['todo:sales', 'todo:shipping'])
      return detail
    })
  }

  // 销售新建：直接是待发货，下单日期服务端写今天
  private async insertOrder(
    ctx: WriteContext,
    viewer: Viewer,
    input: OrderCreate,
    lines: readonly NewLine[],
  ): Promise<OrderDetail> {
    const [row] = await ctx.tx
      .insert(orders)
      .values({
        no: await ctx.nextDocNo('SO'),
        orderDate: this.clock.today(),
        shipDate: input.shipDate,
        customerId: Number(input.customerId),
        storeId: Number(input.storeId),
        status: 'to_ship',
        origin: 'sales',
        note: input.note,
        confirmedBy: viewer.accountId,
        confirmedAt: this.clock.now(),
        createdBy: viewer.accountId,
      })
      .returning({ id: orders.id, createdBy: orders.createdBy })
    if (!row) throw appError.internal()
    await replaceLines(ctx.tx, row, lines)
    return this.detail(ctx, viewer, row.id)
  }

  // 待确认 → 修改并确认（保存后待发货）；待发货 → 修改订单
  update(viewer: Viewer, id: number, input: OrderUpdate): Promise<OrderDetail> {
    return this.writes.run(viewer, async (ctx) => {
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      const confirming = before.status === 'pending_confirm'
      gateAction(before, {
        code: confirming ? 'editAndConfirm' : 'edit',
        version: input.version,
        missing: closedMessage(before.status),
        stale: copy.order.stale,
      })
      const lines = await this.nextLines(ctx, before, input)
      const beforeState = orderStateOf(before)
      const afterState = {
        status: 'to_ship' as const,
        shipDate: input.shipDate,
        note: input.note,
        lines,
      }
      const items = diffOrder(beforeState, afterState)
      if (items.length === 0) throw appError.businessRule(copy.error.noChange)
      await ctx.tx
        .update(orders)
        .set({
          status: 'to_ship',
          shipDate: input.shipDate,
          note: input.note,
          version: orderVersionPlusOne,
          ...(confirming ? { confirmedBy: viewer.accountId, confirmedAt: this.clock.now() } : {}),
        })
        .where(eq(orders.id, id))
      await replaceLines(ctx.tx, { id, createdBy: viewer.accountId }, lines)
      await insertChange(ctx, id, items, input.reason)
      const detail = await this.detail(ctx, viewer, id)
      const action = confirming ? copy.log.action.editAndConfirm : copy.log.action.editOrder
      await ctx.log({
        ...orderLog(detail, action),
        reason: input.reason,
        before: orderLogView(beforeState),
        after: orderLogView(afterState),
      })
      notifyOrder(ctx, detail, confirming ? ['todo:sales', 'todo:shipping'] : ['todo:shipping'])
      return detail
    })
  }

  // 原有行保持原来的目录价快照；已停订、停用的要先删掉；新加的行按目录校验
  private async nextLines(
    ctx: WriteContext,
    before: OrderDetail,
    input: OrderUpdate,
  ): Promise<NewLine[]> {
    const existing = new Map(before.lines.map((line) => [Number(line.productId), line]))
    const kept = input.lines.map((line) => existing.get(Number(line.productId)))
    const stopped = kept
      .filter((line) => line?.discontinued === true)
      .map((line) => line?.name ?? '')
    if (stopped.length > 0) {
      throw appError.businessRule(copy.order.discontinuedSave(namesText(stopped)))
    }
    const addedIds = input.lines
      .map((line) => Number(line.productId))
      .filter((productId) => !existing.has(productId))
    const catalog = await catalogEntriesOf(ctx.tx, Number(before.customerId), addedIds)
    const added = orderableEntries(addedIds, catalog, copy.order.discontinuedSave)
    return input.lines.map((line) => {
      const productId = Number(line.productId)
      const old = existing.get(productId)
      const source = old
        ? {
            productId,
            name: old.name,
            unit: old.unit,
            customerCode: old.customerCode,
            listPriceCents: old.listPriceCents,
          }
        : added.find((entry) => entry.productId === productId)
      if (!source) throw appError.internal()
      return { ...source, qty: line.qty, priceCents: line.priceCents }
    })
  }

  // 待确认不用原因，待发货要原因（按 actions 的 reasonRequired）
  cancel(
    viewer: Viewer,
    id: number,
    input: { version: number; reason?: string | undefined },
  ): Promise<OrderDetail> {
    return this.writes.run(viewer, async (ctx) => {
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      const action = gateAction(before, {
        code: 'cancel',
        version: input.version,
        missing: closedMessage(before.status),
        stale: copy.order.stale,
      })
      const reason = input.reason ?? ''
      if (action.reasonRequired === true && reason === '') {
        throw appError.validation({ reason: copy.order.reasonRequired })
      }
      await ctx.tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelledBy: viewer.accountId,
          cancelledAt: this.clock.now(),
          cancelReason: reason === '' ? null : reason,
          version: orderVersionPlusOne,
        })
        .where(eq(orders.id, id))
      const detail = await this.detail(ctx, viewer, id)
      await ctx.log({ ...orderLog(detail, copy.log.action.cancelOrder), reason })
      notifyOrder(ctx, detail, ['todo:sales', 'todo:shipping'])
      return detail
    })
  }

  // 出货日期到了才能发；打开后销售改过单或取消了 → STALE
  ship(viewer: Viewer, id: number, input: OrderShip): Promise<OrderDetail> {
    return this.writes.run(viewer, async (ctx) => {
      await lockOrder(ctx.tx, viewer, id)
      const before = await this.detail(ctx, viewer, id)
      gateAction(before, {
        code: 'ship',
        version: input.version,
        missing: shipMissing(before.status),
        stale: copy.order.shipChanged,
      })
      const lines = before.lines.map((line) => ({ id: Number(line.id), qty: line.qty }))
      const qtys = shippedQtysOf(lines, input.lines, input.shipNote)
      for (const [lineId, shippedQty] of qtys) {
        await ctx.tx.update(orderLines).set({ shippedQty }).where(eq(orderLines.id, lineId))
      }
      await ctx.tx
        .update(orders)
        .set({
          status: 'shipped',
          shippedBy: viewer.accountId,
          shippedAt: this.clock.now(),
          shipNote: input.shipNote,
          version: orderVersionPlusOne,
        })
        .where(eq(orders.id, id))
      const detail = await this.detail(ctx, viewer, id)
      await ctx.log({
        ...orderLog(detail, copy.log.action.shipOrder, 'shipping'),
        reason: input.shipNote,
      })
      notifyOrder(ctx, detail, ['todo:shipping', `ar:${detail.customerId}`, 'demand'])
      return detail
    })
  }
}
