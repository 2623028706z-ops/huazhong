// 收款、核销预收、作废收款、收付款记录（05 章第 10 节）：写操作先行锁客户，同一客户的核销串行
import {
  appError,
  contract,
  copy,
  formatMoney,
  labels,
  waitCodesOf,
  type OutputOf,
  type PrepaidAllocate,
  type ReceiptCard,
  type ReceiptCreate,
  type ReceiptDetail,
  type RecordStatus,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { allocations, paymentMethods, receipts } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { gateAction } from '../../common/domain/actions.ts'
import { waitCounts } from '../../common/domain/counts.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { customerStoreIds, lockCustomer } from '../../common/org.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { SalesService } from '../sales/sales.service.ts'
import { drawPrepaid } from './domain/ar.ts'
import {
  effectiveAllocations,
  loadLedger,
  loadLedgers,
  type Ledger,
} from '../../common/customer-ledger.ts'
import { actor, owns, assertSnapshot } from '../../common/ledger.ts'
import { fundActions } from '../../common/finance-actions.ts'
import { refundView } from '../../common/finance-history.ts'

type Executor = Db | Tx
type ReceiptRow = typeof receipts.$inferSelect

function receiptCard(
  row: ReceiptRow,
  customerName: string,
  ledger: Ledger | undefined,
  viewer?: Viewer,
): ReceiptCard {
  const valid = row.status === 'valid'
  return {
    id: String(row.id),
    no: row.no,
    version: row.version,
    status: row.status,
    receiptDate: row.receiptDate,
    customerId: String(row.customerId),
    customerName,
    methodName: row.methodName,
    amountCents: row.amountCents,
    prepaidCents: valid ? (ledger?.replay.left.get(row.id) ?? 0) : 0,
    actions: fundActions(
      { ...row, kind: 'receipt' },
      ledger?.replay.left.get(row.id) ?? 0,
      ledger?.refunds.some((refund) => refund.receiptId === row.id && refund.status === 'valid') ??
        false,
      viewer,
    ),
    lockedReason: null,
  }
}

function receiptLog(row: { id: number; no: string }, action: string) {
  return {
    module: 'finance' as const,
    kind: copy.log.kind.receipt,
    action,
    targetType: 'receipts',
    targetId: row.id,
    targetLabel: row.no,
  }
}

// 每条核销不超过这张发货单的未收；不是这个客户的发货单当成找不到
function assertAllocs(ledger: Ledger, allocs: readonly { orderId: string; amountCents: number }[]) {
  const fields: Record<string, string> = {}
  allocs.forEach((alloc, index) => {
    const entry = ledger.cards.find((item) => item.order.orderId === Number(alloc.orderId))
    if (!entry) throw appError.notFound()
    if (alloc.amountCents > entry.card.unpaidCents) {
      fields[`allocs.${index}.amountCents`] = copy.finance.allocOver(
        entry.card.orderNo,
        formatMoney(entry.card.unpaidCents),
      )
    }
  })
  if (Object.keys(fields).length > 0) throw appError.validation(fields)
}

@Injectable()
export class ReceiptService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly sales: SalesService,
    private readonly clock: Clock,
  ) {}

  async detail(executor: Executor, id: number, viewer?: Viewer): Promise<ReceiptDetail> {
    const [row] = await executor.select().from(receipts).where(eq(receipts.id, id))
    const receipt = found(row)
    const customer = await this.sales.customer(executor, receipt.customerId)
    const ledger = await loadLedger(executor, this.sales, receipt.customerId)
    const valid = receipt.status === 'valid'
    return {
      ...receiptCard(receipt, customer.name, ledger, viewer),
      note: orNull(receipt.note),
      voidReason: receipt.voidReason,
      voidedAt: receipt.voidedAt?.toISOString() ?? null,
      allocations: await effectiveAllocations(
        ledger,
        (alloc) => alloc.receiptId === id,
        executor,
        viewer,
      ),
      voidedBy: await actor(executor, receipt.voidedBy),
      refunds: await Promise.all(
        ledger.refunds
          .filter((refund) => refund.receiptId === id)
          .map((refund) => refundView(executor, refund, viewer)),
      ),
      notice: valid ? null : copy.finance.receiptVoidedNotice,
    }
  }

  async notify(
    ctx: WriteContext,
    customerId: number,
    extra: { topic: `receipt:${string}`; version: number }[] = [],
  ) {
    ctx.notify(
      [
        ...extra,
        { topic: `ar:${customerId}`, version: null },
        { topic: 'todo:finance', version: null },
        { topic: 'orders', version: null },
        ...(await loadLedger(ctx.tx, this.sales, customerId)).receipts.map((row) => ({
          topic: `receipt:${row.id}` as const,
          version: null,
        })),
        ...(await loadLedger(ctx.tx, this.sales, customerId)).orders.map((row) => ({
          topic: `order:${row.orderId}` as const,
          version: null,
        })),
      ],
      { storeIds: await customerStoreIds(ctx.tx, customerId) },
    )
  }

  private checkSnapshot(ledger: Ledger, input: ReceiptCreate | PrepaidAllocate) {
    if (
      input.allocs.some(
        (allocation) => !ledger.cards.some(({ card }) => card.orderId === allocation.orderId),
      )
    )
      throw appError.notFound()
    assertSnapshot(
      {
        ledgerToken: ledger.token,
        items: ledger.cards
          .filter(({ card }) => card.unpaidCents > 0)
          .map(({ card }) => ({
            id: card.orderId,
            version: card.version,
            unpaidCents: card.unpaidCents,
          })),
      },
      input,
      input.allocs.map((row) => row.orderId),
      input.expected.map((row) => row.orderId),
    )
  }

  // 收款日期不晚于今天；收款方式须启用
  private async assertReceiptInput(ctx: WriteContext, input: ReceiptCreate): Promise<void> {
    if (input.receiptDate > this.clock.today()) {
      throw appError.validation({ receiptDate: copy.finance.receiptDateFuture })
    }
    const [method] = await ctx.tx
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.kind, 'receive'),
          eq(paymentMethods.name, input.methodName),
          eq(paymentMethods.enabled, true),
        ),
      )
    if (!method) throw appError.validation({ methodName: copy.finance.methodDisabled })
  }

  create(viewer: Viewer, input: ReceiptCreate, idempotencyKey: string): Promise<ReceiptDetail> {
    const customerId = Number(input.customerId)
    return this.writes.run(
      viewer,
      async (ctx) => {
        await this.assertReceiptInput(ctx, input)
        await lockCustomer(ctx.tx, customerId)
        const ledger = await loadLedger(ctx.tx, this.sales, customerId)
        this.checkSnapshot(ledger, input)
        assertAllocs(ledger, input.allocs)
        const [row] = await ctx.tx
          .insert(receipts)
          .values({
            no: await ctx.nextDocNo('SK'),
            receiptDate: input.receiptDate,
            customerId,
            amountCents: input.amountCents,
            methodName: input.methodName,
            note: input.note,
            createdBy: viewer.accountId,
          })
          .returning()
        if (!row) throw appError.internal()
        if (input.allocs.length > 0) {
          await ctx.tx.insert(allocations).values(
            input.allocs.map((alloc) => ({
              receiptId: row.id,
              orderId: Number(alloc.orderId),
              amountCents: alloc.amountCents,
              kind: 'direct' as const,
              createdBy: viewer.accountId,
            })),
          )
        }
        await ctx.log({
          ...receiptLog(row, copy.log.action.registerReceipt),
          after: {
            [copy.field.amount]: formatMoney(row.amountCents),
            [copy.field.method]: row.methodName,
            [copy.field.receiptDate]: row.receiptDate,
          },
        })
        await this.notify(ctx, customerId, [{ topic: `receipt:${row.id}`, version: row.version }])
        return this.detail(ctx.tx, row.id, viewer)
      },
      { endpoint: contract.createReceipt, key: idempotencyKey },
    )
  }

  // 按收款时间先后从各笔有效收款的预收里扣
  allocatePrepaid(
    viewer: Viewer,
    input: PrepaidAllocate,
    idempotencyKey: string,
  ): Promise<OutputOf<typeof contract.allocatePrepaid>> {
    const customerId = Number(input.customerId)
    return this.writes.run(
      viewer,
      async (ctx) => {
        const customer = await this.sales.customer(ctx.tx, customerId)
        await lockCustomer(ctx.tx, customerId)
        const ledger = await loadLedger(ctx.tx, this.sales, customerId)
        this.checkSnapshot(ledger, input)
        const total = input.allocs.reduce((sum, alloc) => sum + alloc.amountCents, 0)
        if (total > ledger.prepaidCents) {
          throw appError.businessRule(copy.finance.prepaidOver(formatMoney(ledger.prepaidCents)))
        }
        assertAllocs(ledger, input.allocs)
        const requests = input.allocs.map((alloc) => ({ ...alloc, orderId: Number(alloc.orderId) }))
        const draws = drawPrepaid(ledger.receipts, ledger.replay.left, requests)
        await ctx.tx.insert(allocations).values(
          draws.map((draw) => ({
            ...draw,
            kind: 'prepaid' as const,
            createdBy: viewer.accountId,
          })),
        )
        await ctx.log({
          module: 'finance',
          kind: copy.log.kind.receipt,
          action: copy.log.action.allocatePrepaid,
          targetType: 'customers',
          targetId: customerId,
          targetLabel: customer.name,
          after: { [copy.field.amount]: formatMoney(total) },
        })
        await this.notify(ctx, customerId)
        const after = await loadLedger(ctx.tx, this.sales, customerId)
        return { customerId: String(customerId), prepaidCents: after.prepaidCents }
      },
      { endpoint: contract.allocatePrepaid, key: idempotencyKey },
    )
  }

  // 作废：这笔收款的核销全部撤回，发货单重新算未收
  private async checkVoid(
    ctx: WriteContext,
    viewer: Viewer,
    id: number,
    input: { version: number },
  ) {
    const [owner] = await ctx.tx
      .select({ customerId: receipts.customerId })
      .from(receipts)
      .where(eq(receipts.id, id))
    const customerId = found(owner).customerId
    await lockCustomer(ctx.tx, customerId)
    await ctx.tx.select({ id: receipts.id }).from(receipts).where(eq(receipts.id, id)).for('update')
    const before = await this.detail(ctx.tx, id, viewer)
    const receipt = found((await ctx.tx.select().from(receipts).where(eq(receipts.id, id)))[0])
    if (!owns(viewer, receipt.createdBy)) throw appError.forbidden()
    if (before.refunds.some((refund) => refund.status === 'valid'))
      throw appError.businessRule(copy.rework.receiptVoidLocked)
    gateAction(before, {
      code: 'voidReceipt',
      version: input.version,
      missing: copy.finance.receiptStale,
      stale: copy.finance.receiptStale,
    })
    return customerId
  }
  void(
    viewer: Viewer,
    id: number,
    input: { version: number; reason: string },
  ): Promise<ReceiptDetail> {
    return this.writes.run(viewer, async (ctx) => {
      const customerId = await this.checkVoid(ctx, viewer, id, input)
      const now = this.clock.now()
      await ctx.tx
        .update(receipts)
        .set({
          status: 'voided',
          voidReason: input.reason,
          voidedBy: viewer.accountId,
          voidedAt: now,
          version: sql`${receipts.version} + 1`,
        })
        .where(eq(receipts.id, id))
      await ctx.tx
        .update(allocations)
        .set({ revokedAt: now, revokedBy: viewer.accountId, revokeReason: input.reason })
        .where(and(eq(allocations.receiptId, id), isNull(allocations.revokedAt)))
      const detail = await this.detail(ctx.tx, id, viewer)
      await ctx.log({
        ...receiptLog({ id, no: detail.no }, copy.log.action.voidReceipt),
        reason: input.reason,
        before: { [copy.field.status]: labels.recordStatus.valid },
        after: { [copy.field.status]: labels.recordStatus.voided },
      })
      await this.notify(ctx, customerId, [{ topic: `receipt:${id}`, version: detail.version }])
      return detail
    })
  }

  // 收付款记录：阶段 3 只有收款；按收款日期倒序
  async records(
    query: {
      status?: RecordStatus | undefined
      from?: string | undefined
      to?: string | undefined
      cursor?: string | undefined
      limit: number
    },
    viewer?: Viewer,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.listFinanceRecords>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.records(query, viewer, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const rows = await executor
      .select()
      .from(receipts)
      .where(
        and(
          query.status === undefined ? undefined : eq(receipts.status, query.status),
          dateBetween(receipts.receiptDate, query),
          beforeCursor(receipts.receiptDate, receipts.id, query.cursor),
        ),
      )
      .orderBy(desc(receipts.receiptDate), desc(receipts.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.receiptDate, row.id])
    const customerIds = [...new Set(page.items.map((row) => row.customerId))]
    const names = new Map((await this.sales.customersByIds(customerIds)).map((c) => [c.id, c.name]))
    const ledgers = await loadLedgers(executor, this.sales, customerIds)
    return {
      items: page.items.map((row) =>
        receiptCard(row, names.get(row.customerId) ?? '', ledgers.get(row.customerId), viewer),
      ),
      nextCursor: page.nextCursor,
      actions: [],
      counts: waitCounts(waitCodesOf('recordStatus'), []),
    }
  }
}
