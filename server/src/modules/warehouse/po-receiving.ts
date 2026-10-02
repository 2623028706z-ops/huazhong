import { appError, contract, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import {
  purchaseOrderLines,
  purchaseOrders,
  purchaseReturnLines,
  purchaseReturns,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import { actorLabelOf, type Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { PurchaseService } from '../purchase/purchase.service.ts'
import { applyPoPrices, assertPoLines } from './po-prices.ts'
import { receiveStock, returnStock } from './stock-writes.ts'
import { lockSupplierLedger, notifySupplierFinance, owns } from '../../common/ledger.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>['body']
function warehouseLog(row: { id: number; no: string }, action: string) {
  return {
    module: 'warehouse' as const,
    kind: copy.log.kind.purchaseOrder,
    action,
    targetType: 'purchase_orders',
    targetId: row.id,
    targetLabel: row.no,
  }
}
@Injectable()
export class PoReceiving {
  constructor(
    private readonly writes: WriteService,
    private readonly purchase: PurchaseService,
    private readonly clock: Clock,
  ) {}
  void(viewer: Viewer, id: number, input: In<'voidPurchaseOrder'>) {
    return this.writes.run(viewer, async (ctx) => {
      const pointer = found(
        (await ctx.tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0],
      )
      await lockSupplierLedger(ctx.tx, pointer.supplierId)
      const po = await this.purchase.lock(ctx.tx, id)
      const detail = await this.purchase.detail(ctx.tx, viewer, id)
      if (!owns(viewer, po.receivedBy ?? po.createdBy)) throw appError.forbidden()
      gateAction(detail, {
        code: 'voidPo',
        version: input.version,
        missing: copy.rework.poVoidLocked,
        stale: copy.rework.poStale,
      })
      await returnStock(
        ctx,
        { id, no: po.no, date: this.clock.today() },
        detail.lines.map((line) => ({
          materialId: Number(line.materialId),
          name: line.name,
          unit: line.unit,
          qty: (line.receivedQty ?? 0) - line.returnedQty,
        })),
      )
      await ctx.tx
        .update(purchaseOrders)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: this.clock.now(),
          version: sql`${purchaseOrders.version}+1`,
        })
        .where(eq(purchaseOrders.id, id))
      await ctx.log({
        ...warehouseLog(po, copy.log.action.voidPurchaseOrder),
        reason: input.reason,
      })
      this.purchase.notify(ctx, { ...po, version: po.version + 1 })
      await notifySupplierFinance(ctx, po.supplierId)
      return this.purchase.detail(ctx.tx, viewer, id)
    })
  }
  receive(viewer: Viewer, id: number, input: In<'receivePurchaseOrder'>) {
    return this.writes.run(viewer, async (ctx) => {
      const po = await this.purchase.lock(ctx.tx, id)
      const detail = await this.purchase.detail(ctx.tx, viewer, id)
      gateAction(detail, {
        code: 'receive',
        version: input.version,
        stale: copy.finance.receiveChanged,
        missing:
          po.status === 'cancelled' ? copy.finance.receiveCancelled : copy.finance.poReceived,
      })
      assertPoLines(detail, input.lines, true)
      const changes = await applyPoPrices(ctx, detail, {
        lines: input.lines,
        reason: input.reason ?? '',
      })
      const stocked = await this.receivedLines(ctx, detail, input.lines)
      await receiveStock(ctx, { id, no: po.no, date: this.clock.today() }, stocked)
      const status = input.lines.some((line) => line.receivedQty > 0) ? 'received' : 'rejected'
      await ctx.tx
        .update(purchaseOrders)
        .set({
          status,
          receivedAt: this.clock.now(),
          receivedBy: viewer.accountId,
          recvNote: input.recvNote,
          version: sql`${purchaseOrders.version} + 1`,
        })
        .where(eq(purchaseOrders.id, id))
      await ctx.log({
        ...warehouseLog(
          po,
          status === 'received'
            ? copy.log.action.receivePurchaseOrder
            : copy.log.action.rejectPurchaseOrder,
        ),
        reason: input.reason ?? '',
        after: {
          [copy.records.poChange]: stocked
            .map((line) => `${line.name} ${line.qty} ${line.unit}`)
            .join(copy.separator),
          [copy.records.priceChange]: changes,
        },
      })
      this.purchase.notify(ctx, { ...po, version: po.version + 1 })
      await notifySupplierFinance(ctx, po.supplierId)
      return this.purchase.detail(ctx.tx, viewer, id)
    })
  }
  private async receivedLines(
    ctx: WriteContext,
    detail: Awaited<ReturnType<PurchaseService['detail']>>,
    lines: In<'receivePurchaseOrder'>['lines'],
  ) {
    const byId = new Map(detail.lines.map((line) => [line.id, line]))
    for (const line of lines) {
      await ctx.tx
        .update(purchaseOrderLines)
        .set({ receivedQty: line.receivedQty })
        .where(eq(purchaseOrderLines.id, Number(line.poLineId)))
    }
    return lines.map((line) => {
      const old = found(byId.get(line.poLineId))
      return { ...old, materialId: Number(old.materialId), qty: line.receivedQty }
    })
  }
  reprice(viewer: Viewer, id: number, input: In<'repricePurchaseOrder'>) {
    return this.writes.run(viewer, async (ctx) => {
      const po = await this.purchase.lock(ctx.tx, id)
      const detail = await this.purchase.detail(ctx.tx, viewer, id)
      gateAction(detail, {
        code: 'reprice',
        version: input.version,
        stale: copy.finance.poStale,
        missing: detail.allocations.some((row) => row.status === 'valid')
          ? copy.finance.poRepricePaid
          : copy.finance.poAllReturned,
      })
      assertPoLines(detail, input.lines, false)
      const changes = await applyPoPrices(ctx, detail, input)
      if (changes.length === 0) throw appError.businessRule(copy.error.noChange)
      await this.bump(ctx, id)
      await ctx.log({
        ...warehouseLog(po, copy.log.action.repricePurchaseOrder),
        reason: input.reason,
        after: { [copy.records.priceChange]: changes },
      })
      this.purchase.notify(ctx, { ...po, version: po.version + 1 })
      await notifySupplierFinance(ctx, po.supplierId)
      return this.purchase.detail(ctx.tx, viewer, id)
    })
  }
  returns(viewer: Viewer, id: number, input: In<'returnPurchaseOrder'>) {
    return this.writes.run(viewer, async (ctx) => {
      const po = await this.purchase.lock(ctx.tx, id)
      const detail = await this.purchase.detail(ctx.tx, viewer, id)
      gateAction(detail, {
        code: 'return',
        version: input.version,
        stale: copy.finance.poStale,
        missing: detail.allocations.some((row) => row.status === 'valid')
          ? copy.finance.poReturnPaid
          : copy.finance.poAllReturned,
      })
      assertPoLines(detail, input.lines, false)
      const lines = input.lines.map((line) => {
        const old = found(detail.lines.find((row) => row.id === line.poLineId))
        const max = (old.receivedQty ?? 0) - old.returnedQty
        if (line.qty > max)
          throw appError.businessRule(copy.finance.returnOver(old.name, max, old.unit))
        return {
          materialId: Number(old.materialId),
          name: old.name,
          unit: old.unit,
          qty: line.qty,
          poLineId: Number(old.id),
        }
      })
      await returnStock(ctx, { id, no: po.no, date: this.clock.today() }, lines)
      await this.recordReturn(ctx, id, lines)
      await this.bump(ctx, id)
      await ctx.log({
        ...warehouseLog(po, copy.log.action.returnPurchaseOrder),
        after: { [copy.records.returns]: lines },
      })
      this.purchase.notify(ctx, { ...po, version: po.version + 1 })
      await notifySupplierFinance(ctx, po.supplierId)
      return this.purchase.detail(ctx.tx, viewer, id)
    })
  }
  private async bump(ctx: WriteContext, id: number) {
    await ctx.tx
      .update(purchaseOrders)
      .set({ version: sql`${purchaseOrders.version} + 1` })
      .where(eq(purchaseOrders.id, id))
  }
  private async recordReturn(
    ctx: WriteContext,
    id: number,
    lines: { poLineId: number; name: string; qty: number }[],
  ) {
    const [row] = await ctx.tx
      .insert(purchaseReturns)
      .values({
        poId: id,
        actorLabel: actorLabelOf(ctx.viewer),
        createdBy: ctx.viewer?.accountId ?? 0,
      })
      .returning()
    await ctx.tx.insert(purchaseReturnLines).values(
      lines.map((line) => ({
        ...line,
        returnId: found(row).id,
        createdBy: ctx.viewer?.accountId ?? 0,
      })),
    )
    for (const line of lines) {
      await ctx.tx
        .update(purchaseOrderLines)
        .set({ returnedQty: sql`${purchaseOrderLines.returnedQty} + ${line.qty}` })
        .where(eq(purchaseOrderLines.id, line.poLineId))
    }
  }
}
