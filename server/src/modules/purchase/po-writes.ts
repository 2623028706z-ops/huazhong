import { appError, contract, copy, formatMoney } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import { poChanges, purchaseOrderLines, purchaseOrders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { gateAction } from '../../common/domain/actions.ts'
import { actorLabelOf, type Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import {
  insertPoLines,
  lockPo,
  lockSupplier,
  materialSnapshots,
  notifyPo,
} from './purchase-common.ts'
import { PoReads } from './po-reads.ts'

type Create = ParsedInput<typeof contract.createPurchaseOrder>['body']
type Update = ParsedInput<typeof contract.updatePurchaseOrder>['body']
function poLog(row: { id: number; no: string }, action: string) {
  return {
    module: 'purchase' as const,
    kind: copy.log.kind.purchaseOrder,
    action,
    targetType: 'purchase_orders',
    targetId: row.id,
    targetLabel: row.no,
  }
}
function lineChanges(
  before: { materialId: number; name: string; unit: string; qty: number; priceCents: number }[],
  next: Update['lines'],
): string[] {
  const changes: string[] = []
  for (const old of before) {
    const line = next.find((row) => Number(row.materialId) === old.materialId)
    if (!line) {
      changes.push(copy.order.change.removed(old.name))
      continue
    }
    if (old.qty !== line.qty) changes.push(copy.order.change.qty(old.name, old.qty, line.qty))
    if (old.priceCents !== line.priceCents)
      changes.push(
        copy.order.change.price(
          old.name,
          formatMoney(old.priceCents),
          formatMoney(line.priceCents),
        ),
      )
  }
  return changes
}

@Injectable()
export class PoWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: PoReads,
    private readonly clock: Clock,
  ) {}

  create(viewer: Viewer, input: Create, key: string) {
    return this.writes.run(
      viewer,
      async (ctx) => {
        await lockSupplier(ctx.tx, Number(input.supplierId))
        const [row] = await ctx.tx
          .insert(purchaseOrders)
          .values({
            no: await ctx.nextDocNo('PO'),
            orderDate: this.clock.today(),
            supplierId: Number(input.supplierId),
            buyerId: viewer.accountId,
            note: input.note,
            createdBy: viewer.accountId,
          })
          .returning()
        const po = found(row)
        await insertPoLines(ctx, po.id, input.lines)
        await ctx.log({
          ...poLog(po, copy.log.action.createPurchaseOrder),
          after: { [copy.field.note]: input.note },
        })
        notifyPo(ctx, po)
        return this.reads.detail(ctx.tx, viewer, po.id)
      },
      { endpoint: contract.createPurchaseOrder, key },
    )
  }
  update(viewer: Viewer, id: number, input: Update) {
    return this.writes.run(viewer, (ctx) => this.updateInTx(ctx, id, input))
  }
  private async updateInTx(ctx: WriteContext, id: number, input: Update) {
    const viewer = found(ctx.viewer ?? undefined)
    const po = await lockPo(ctx.tx, id)
    const before = await this.reads.detail(ctx.tx, viewer, id)
    gateAction(before, {
      code: 'editPo',
      version: input.version,
      missing: copy.finance.poStateLocked,
      stale: copy.finance.poStale,
    })
    if (po.inviteId !== null && String(po.supplierId) !== input.supplierId)
      throw appError.businessRule(copy.finance.poCannotChangeSupplier)
    const changes = await this.changes(ctx, before, input)
    if (changes.length === 0) throw appError.businessRule(copy.error.noChange)
    if (input.reason === '') throw appError.validation({ reason: copy.finance.poReasonRequired })
    await this.replaceLines(ctx, id, input.lines)
    await ctx.tx
      .update(purchaseOrders)
      .set({
        supplierId: Number(input.supplierId),
        note: input.note,
        version: sql`${purchaseOrders.version} + 1`,
      })
      .where(eq(purchaseOrders.id, id))
    await ctx.tx.insert(poChanges).values({
      poId: id,
      actorLabel: actorLabelOf(viewer),
      reason: input.reason,
      items: changes,
      createdBy: viewer.accountId,
    })
    await ctx.log({
      ...poLog(po, copy.log.action.updatePurchaseOrder),
      reason: input.reason,
      before: {
        [copy.records.poChange]: before.lines
          .map((line) =>
            copy.order.lineView(`${line.qty} ${line.unit}`, formatMoney(line.priceCents)),
          )
          .join(copy.separator),
      },
      after: { [copy.log.changes]: changes.join(copy.separator) },
    })
    notifyPo(
      ctx,
      { ...po, supplierId: Number(input.supplierId), version: po.version + 1 },
      po.supplierId,
    )
    return this.reads.detail(ctx.tx, viewer, id)
  }
  private async replaceLines(ctx: WriteContext, id: number, lines: Update['lines']) {
    const old = await ctx.tx
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.poId, id))
      .orderBy(asc(purchaseOrderLines.sort))
    await ctx.tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id))
    await insertPoLines(ctx, id, lines, old)
  }
  private async changes(
    ctx: WriteContext,
    before: Awaited<ReturnType<PoReads['detail']>>,
    input: Update,
  ) {
    const changes = lineChanges(
      before.lines.map((line) => ({ ...line, materialId: Number(line.materialId) })),
      input.lines,
    )
    if (before.supplierId !== input.supplierId) {
      const supplier = await lockSupplier(ctx.tx, Number(input.supplierId))
      changes.unshift(copy.finance.poSupplierChanged(before.supplierName, supplier.name))
    }
    const mats = await materialSnapshots(
      ctx.tx,
      input.lines.map((line) => line.materialId),
      before.lines.map((line) => Number(line.materialId)),
    )
    if ((before.note ?? '') !== input.note) changes.push(copy.order.change.note)
    const added = input.lines.filter(
      (line) => !before.lines.some((old) => old.materialId === line.materialId),
    )
    if (added.length > 0) {
      added.forEach((line) => {
        const mat = found(mats.find((m) => String(m.id) === line.materialId))
        changes.push(copy.order.change.added(mat.name, line.qty, mat.unit))
      })
    }
    return changes
  }
  cancel(
    viewer: Viewer,
    id: number,
    input: ParsedInput<typeof contract.cancelPurchaseOrder>['body'],
  ) {
    return this.writes.run(viewer, async (ctx) => {
      const po = await lockPo(ctx.tx, id)
      const current = await this.reads.detail(ctx.tx, viewer, id)
      gateAction(current, {
        code: 'cancelPo',
        version: input.version,
        missing: copy.finance.poStateLocked,
        stale: copy.finance.poStale,
      })
      if (input.reason === '')
        throw appError.validation({ reason: copy.finance.poCancelReasonRequired })
      await ctx.tx
        .update(purchaseOrders)
        .set({
          status: 'cancelled',
          cancelReason: input.reason,
          cancelledBy: viewer.accountId,
          cancelledAt: this.clock.now(),
          version: sql`${purchaseOrders.version} + 1`,
        })
        .where(eq(purchaseOrders.id, id))
      await ctx.log({ ...poLog(po, copy.log.action.cancelPurchaseOrder), reason: input.reason })
      notifyPo(ctx, { ...po, version: po.version + 1 })
      return this.reads.detail(ctx.tx, viewer, id)
    })
  }
}
