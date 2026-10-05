// 售后写接口（05 章第 4、5 节）：门店申请、销售新建 / 处理 / 关闭、销售或财务作废。
// 同一订单的售后先行锁订单（可申请数量串行）；作废先锁客户（和开对账单互斥）
import {
  appError,
  contract,
  copy,
  formatMoney,
  formatQty,
  type AfterCreate,
  type AfterDetail,
  type AfterProcess,
  type OrderDetail,
  type StoreAfterCreate,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import { afterLineImages, afterLines, afters } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import { sumOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { customerStoreIds } from '../../common/org.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { FilesService } from '../files/files.service.ts'
import { afterVisibleTo, AfterReads } from './after-query.ts'
import { checkClaims, checkProcess, type ClaimLine } from './domain/order-rules.ts'
import { orderDetailOf } from './order-query.ts'
import { lockOrder } from './order-rows.ts'
import { notifyCustomerFinance, owns, assertSourceUnstatemented } from '../../common/statements.ts'

const afterVersionPlusOne = sql`${afters.version} + 1`

interface NewAfterLine {
  orderLineId: number
  name: string
  unit: string
  requestedQty: number | null
  qty: number
  priceCents: number
  reason: AfterCreate['lines'][number]['reason']
  description: string
  imageFileIds: readonly number[]
}

// 订单明细里能挂售后的行：可申请数量、发货单价
function claimLinesOf(order: OrderDetail): ClaimLine[] {
  return order.lines.map((line) => ({
    id: Number(line.id),
    name: line.name,
    maxQty: line.maxQty ?? 0,
    shipPriceCents: line.priceCents,
  }))
}

function afterLog(
  detail: { id: string; no: string },
  action: string,
  module: 'sales' | 'finance' = 'sales',
) {
  return {
    module,
    kind: copy.log.kind.after,
    action,
    targetType: 'afters',
    targetId: Number(detail.id),
    targetLabel: detail.no,
  }
}

// 日志里的修改前后：一行一项「2 束 × ¥68.00」
function afterLogView(detail: AfterDetail): Record<string, string> {
  const view: Record<string, string> = {}
  for (const line of detail.lines) {
    view[line.name] = copy.order.lineView(
      formatQty(line.qty, line.unit),
      formatMoney(line.priceCents),
    )
  }
  return view
}

// 行锁售后（门店只能锁本店的），返回它挂的订单和客户
async function lockAfter(tx: Tx, viewer: Viewer, id: number) {
  const [pointer] = await tx
    .select({ orderId: afters.orderId })
    .from(afters)
    .where(and(eq(afters.id, id), afterVisibleTo(viewer)))
  await lockOrder(tx, viewer, found(pointer).orderId)
  const [row] = await tx
    .select({
      orderId: afters.orderId,
      customerId: afters.customerId,
      storeId: afters.storeId,
      origin: afters.origin,
      createdBy: afters.createdBy,
      processedBy: afters.processedBy,
    })
    .from(afters)
    .where(and(eq(afters.id, id), afterVisibleTo(viewer)))
    .for('update')
  return found(row)
}

// 售后明细逐行写，带图片的再写图片
async function insertAfterLines(
  ctx: WriteContext,
  afterId: number,
  lines: readonly NewAfterLine[],
  accountId: number,
) {
  for (const [sort, { imageFileIds, ...line }] of lines.entries()) {
    const [saved] = await ctx.tx
      .insert(afterLines)
      .values({ ...line, afterId, sort, createdBy: accountId })
      .returning({ id: afterLines.id })
    if (!saved) throw appError.internal()
    if (imageFileIds.length === 0) continue
    await ctx.tx.insert(afterLineImages).values(
      imageFileIds.map((fileId, index) => ({
        afterLineId: saved.id,
        fileId,
        sort: index,
        createdBy: accountId,
      })),
    )
  }
}

@Injectable()
export class AfterWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: AfterReads,
    private readonly files: FilesService,
    private readonly clock: Clock,
  ) {}

  private order(ctx: WriteContext, viewer: Viewer, id: number): Promise<OrderDetail> {
    return orderDetailOf(ctx.tx, viewer, id, this.clock.today())
  }

  // 售后变了：未对账净额可能变，推给这个客户的每家门店
  private async notifyAr(ctx: WriteContext, detail: AfterDetail, customerId: number) {
    await notifyCustomerFinance(ctx, customerId)
    ctx.notify(
      [
        { topic: `after:${detail.id}`, version: detail.version },
        { topic: 'afters', version: null },
        { topic: `order:${detail.orderId}`, version: null },
        { topic: 'todo:sales', version: null },
        { topic: `ar:${customerId}`, version: null },
      ],
      { storeIds: await customerStoreIds(ctx.tx, customerId) },
    )
  }

  private async insertAfter(
    ctx: WriteContext,
    order: OrderDetail,
    origin: 'store' | 'sales',
    lines: readonly NewAfterLine[],
  ): Promise<number> {
    const viewer = ctx.viewer
    if (!viewer) throw appError.internal()
    const processed = origin === 'sales'
    const [row] = await ctx.tx
      .insert(afters)
      .values({
        no: await ctx.nextDocNo('AS'),
        afterDate: this.clock.today(),
        orderId: Number(order.id),
        customerId: Number(order.customerId),
        storeId: Number(order.storeId),
        status: processed ? 'processed' : 'pending',
        origin,
        amountCents: processed ? sumOf(lines, (line) => line.qty * line.priceCents) : null,
        processedBy: processed ? viewer.accountId : null,
        processedAt: processed ? this.clock.now() : null,
        // 销售代门店新建的直接是已处理：门店该看结果（2026-10-06 用户定）
        storeNoticeAt: processed ? this.clock.now() : null,
        createdBy: viewer.accountId,
      })
      .returning({ id: afters.id })
    if (!row) throw appError.internal()
    await insertAfterLines(ctx, row.id, lines, viewer.accountId)
    return row.id
  }

  // 订单还能不能挂售后：没发货、都申请过了、过了期限（门店）按 actions 拦
  private async claimableOrder(
    ctx: WriteContext,
    viewer: Viewer,
    orderId: number,
    code: 'createAfter' | 'applyAfter',
  ): Promise<OrderDetail> {
    await lockOrder(ctx.tx, viewer, orderId)
    const order = await this.order(ctx, viewer, orderId)
    gateAction(order, {
      code,
      missing: order.status === 'shipped' ? copy.order.allAftered : copy.after.orderNotShipped,
      stale: copy.after.stale,
    })
    return order
  }

  // 销售新建：不看申请期限，直接是已处理；每行选原因，说明选填，不带图片
  create(viewer: Viewer, input: AfterCreate, idempotencyKey: string): Promise<AfterDetail> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const order = await this.claimableOrder(ctx, viewer, Number(input.orderId), 'createAfter')
        const claims = input.lines.map((line) => ({ ...line, id: Number(line.orderLineId) }))
        checkClaims(claimLinesOf(order), claims, copy.after.qtyOverMax)
        const lines = claims.map((claim) => ({
          ...this.orderLineOf(order, claim.id),
          requestedQty: null,
          qty: claim.qty,
          priceCents: claim.priceCents,
          reason: claim.reason,
          description: claim.description,
          imageFileIds: [],
        }))
        const id = await this.insertAfter(ctx, order, 'sales', lines)
        const detail = await this.reads.detail(ctx.tx, viewer, id)
        await ctx.log({
          ...afterLog(detail, copy.log.action.createAfter),
          reason: input.note,
          after: afterLogView(detail),
        })
        await this.notifyAr(ctx, detail, Number(order.customerId))
        return detail
      },
      { endpoint: contract.createAfter, key: idempotencyKey },
    )
  }

  private orderLineOf(order: OrderDetail, lineId: number) {
    const line = order.lines.find((item) => Number(item.id) === lineId)
    if (!line) throw appError.notFound()
    return { orderLineId: lineId, name: line.name, unit: line.unit }
  }

  // 门店申请：在售后申请期限内；单价取发货单价；每行说明必填，图片须是本人上传、已通过检测
  createStore(
    viewer: Viewer,
    input: StoreAfterCreate,
    idempotencyKey: string,
  ): Promise<AfterDetail> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const order = await this.claimableOrder(ctx, viewer, Number(input.orderId), 'applyAfter')
        const claimLines = claimLinesOf(order)
        const claims = input.lines.map((line) => {
          const id = Number(line.orderLineId)
          const priceCents = claimLines.find((claim) => claim.id === id)?.shipPriceCents ?? 0
          return { ...line, id, priceCents }
        })
        checkClaims(claimLines, claims, copy.after.storeQtyInvalid)
        const imageIds = claims.flatMap((claim) => claim.imageFileIds.map(Number))
        await this.files.assertUsable(ctx.tx, viewer, 'after_image', imageIds)
        const lines = claims.map((claim) => ({
          ...this.orderLineOf(order, claim.id),
          requestedQty: claim.qty,
          qty: claim.qty,
          priceCents: claim.priceCents,
          reason: claim.reason,
          description: claim.description,
          imageFileIds: claim.imageFileIds.map(Number),
        }))
        const id = await this.insertAfter(ctx, order, 'store', lines)
        const detail = await this.reads.detail(ctx.tx, viewer, id)
        await ctx.log({
          ...afterLog(detail, copy.log.action.applyAfter),
          after: afterLogView(detail),
        })
        ctx.notify(
          [
            { topic: `after:${detail.id}`, version: detail.version },
            { topic: 'afters', version: null },
            { topic: `order:${order.id}`, version: null },
            { topic: 'todo:sales', version: null },
          ],
          { storeIds: [order.storeId] },
        )
        return detail
      },
      { endpoint: contract.createStoreAfter, key: idempotencyKey },
    )
  }

  // 门店提交的只改数量和单价，不能增删行；全 0 要改成关闭；数量不超过可申请数量（排除本张）
  process(viewer: Viewer, id: number, input: AfterProcess): Promise<AfterDetail> {
    return this.writes.run(viewer, async (ctx) => {
      const ref = await lockAfter(ctx.tx, viewer, id)
      const before = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(before, {
        code: 'processAfter',
        version: input.version,
        missing: copy.after.stale,
        stale: copy.after.stale,
      })
      const claims = input.lines.map((line) => ({ ...line, id: Number(line.id) }))
      checkProcess(before.lines, claims)
      for (const claim of claims) {
        await ctx.tx
          .update(afterLines)
          .set({ qty: claim.qty, priceCents: claim.priceCents })
          .where(eq(afterLines.id, claim.id))
      }
      await ctx.tx
        .update(afters)
        .set({
          status: 'processed',
          amountCents: sumOf(claims, (claim) => claim.qty * claim.priceCents),
          note: input.note,
          processedBy: viewer.accountId,
          processedAt: this.clock.now(),
          // 门店该看结果（2026-10-06 第 3 批）：处理、关闭、作废、销售代建都记
          storeNoticeAt: this.clock.now(),
          version: afterVersionPlusOne,
        })
        .where(eq(afters.id, id))
      const detail = await this.reads.detail(ctx.tx, viewer, id)
      await ctx.log({
        ...afterLog(detail, copy.log.action.processAfter),
        reason: input.note,
        before: afterLogView(before),
        after: afterLogView(detail),
      })
      await this.notifyAr(ctx, detail, ref.customerId)
      return detail
    })
  }

  close(
    viewer: Viewer,
    id: number,
    input: { version: number; reason: string },
  ): Promise<AfterDetail> {
    return this.writes.run(viewer, async (ctx) => {
      const ref = await lockAfter(ctx.tx, viewer, id)
      const before = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(before, {
        code: 'closeAfter',
        version: input.version,
        missing: copy.after.stale,
        stale: copy.after.stale,
      })
      await ctx.tx
        .update(afters)
        .set({
          status: 'closed',
          closeReason: input.reason,
          storeNoticeAt: this.clock.now(),
          version: afterVersionPlusOne,
        })
        .where(eq(afters.id, id))
      await ctx.log({ ...afterLog(before, copy.log.action.closeAfter), reason: input.reason })
      const detail = await this.reads.detail(ctx.tx, viewer, id)
      ctx.notify(
        [
          { topic: `after:${detail.id}`, version: detail.version },
          { topic: 'afters', version: null },
          { topic: `order:${ref.orderId}`, version: null },
          { topic: 'todo:sales', version: null },
        ],
        { storeIds: [String(ref.storeId)] },
      )
      return detail
    })
  }

  // 销售、财务都能作废；先锁客户再锁售后（和登记收款、作废收款互斥）
  void(
    viewer: Viewer,
    id: number,
    input: { version: number; reason: string },
  ): Promise<AfterDetail> {
    return this.writes.run(viewer, async (ctx) => {
      const ref = await lockAfter(ctx.tx, viewer, id)
      const before = await this.reads.detail(ctx.tx, viewer, id)
      if (!owns(viewer, (ref.origin === 'store' ? ref.processedBy : ref.createdBy) ?? 0))
        throw appError.forbidden()
      await assertSourceUnstatemented(ctx.tx, 'after', id)
      gateAction(before, {
        code: 'voidAfter',
        version: input.version,
        missing: copy.after.stale,
        stale: copy.after.stale,
      })
      await ctx.tx
        .update(afters)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: this.clock.now(),
          // 看过后又被作废也重新提醒门店
          storeNoticeAt: this.clock.now(),
          version: afterVersionPlusOne,
        })
        .where(eq(afters.id, id))
      const detail = await this.reads.detail(ctx.tx, viewer, id)
      const module = viewer.modules.includes('sales') ? 'sales' : 'finance'
      await ctx.log({
        ...afterLog(detail, copy.log.action.voidAfter, module),
        reason: input.reason,
      })
      await this.notifyAr(ctx, detail, ref.customerId)
      return detail
    })
  }
}
