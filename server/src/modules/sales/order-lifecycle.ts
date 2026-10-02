import { appError, contract, copy } from '@huazhong/shared'
import { Controller, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { orders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../common/endpoint.ts'
import { lockCustomer } from '../../common/org.ts'
import { notifyCustomerFinance } from '../../common/ledger.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { orderDetailOf } from './order-query.ts'
import { lockOrder } from './order-rows.ts'
import { notifyOrder, orderVersionPlusOne, orderLog } from './order-lines.ts'
import { rolesOf } from './domain/order-actions.ts'
import { ownsOrder } from './domain/order-view.ts'
import { applyOrderLifecycle, type LifecycleAction } from './order-lifecycle-writes.ts'
type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>
@Injectable()
export class OrderLifecycle {
  constructor(
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}
  change(
    viewer: Viewer,
    id: number,
    input: { version: number; reason?: string },
    code: LifecycleAction,
  ) {
    return this.writes.run(viewer, async (ctx) => {
      const pointer = found((await ctx.tx.select().from(orders).where(eq(orders.id, id)))[0])
      await lockCustomer(ctx.tx, pointer.customerId)
      await lockOrder(ctx.tx, viewer, id)
      const before = await orderDetailOf(ctx.tx, viewer, id, this.clock.today())
      const current = found((await ctx.tx.select().from(orders).where(eq(orders.id, id)))[0])
      if (
        ['approveCancel', 'rejectCancel', 'voidOrder'].includes(code) &&
        !ownsOrder(current, rolesOf(viewer))
      )
        throw appError.forbidden()
      gateAction(before, {
        code,
        version: input.version,
        missing: copy.rework.orderOperationLocked,
        stale: copy.rework.orderOperationStale,
      })
      await applyOrderLifecycle(ctx, {
        id,
        code,
        reason: input.reason ?? '',
        now: this.clock.now(),
        accountId: viewer.accountId,
      })
      await ctx.tx.update(orders).set({ version: orderVersionPlusOne }).where(eq(orders.id, id))
      const after = await orderDetailOf(ctx.tx, viewer, id, this.clock.today())
      const names = {
        requestCancel: copy.log.action.requestOrderCancel,
        withdrawCancel: copy.log.action.withdrawOrderCancel,
        approveCancel: copy.log.action.approveOrderCancel,
        rejectCancel: copy.log.action.rejectOrderCancel,
        voidOrder: copy.log.action.voidOrder,
      }
      await ctx.log({
        ...orderLog(after, names[code]),
        reason: input.reason ?? '',
      })
      notifyOrder(ctx, after, ['todo:sales', 'todo:shipping', `ar:${after.customerId}`])
      await notifyCustomerFinance(ctx, Number(after.customerId))
      return after
    })
  }
}
@Controller()
export class OrderLifecycleController {
  constructor(private readonly service: OrderLifecycle) {}
  @Route(contract.requestOrderCancel)
  request(@CurrentViewer() viewer: Viewer, @Input() input: In<'requestOrderCancel'>) {
    return this.service.change(viewer, Number(input.params.id), input.body, 'requestCancel')
  }
  @Route(contract.withdrawOrderCancel)
  withdraw(@CurrentViewer() viewer: Viewer, @Input() input: In<'withdrawOrderCancel'>) {
    return this.service.change(viewer, Number(input.params.id), input.body, 'withdrawCancel')
  }
  @Route(contract.approveOrderCancel)
  approve(@CurrentViewer() viewer: Viewer, @Input() input: In<'approveOrderCancel'>) {
    return this.service.change(viewer, Number(input.params.id), input.body, 'approveCancel')
  }
  @Route(contract.rejectOrderCancel)
  reject(@CurrentViewer() viewer: Viewer, @Input() input: In<'rejectOrderCancel'>) {
    return this.service.change(viewer, Number(input.params.id), input.body, 'rejectCancel')
  }
  @Route(contract.voidOrder)
  void(@CurrentViewer() viewer: Viewer, @Input() input: In<'voidOrder'>) {
    return this.service.change(viewer, Number(input.params.id), input.body, 'voidOrder')
  }
}
