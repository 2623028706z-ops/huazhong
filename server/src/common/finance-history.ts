import { type PaymentAllocation, type RefundDetail } from '@huazhong/shared'
import type { Db, Tx } from '../../db/client.ts'
import { type refunds, type paymentAllocations } from '../../db/schema/index.ts'
import type { Viewer } from './domain/viewer.ts'
import { found } from './scope.ts'
import { actor, actors, ownActions } from './ledger.ts'
import { allocationKey, type loadPaymentLedger } from './payment-ledger.ts'
export async function refundView(
  executor: Db | Tx,
  row: typeof refunds.$inferSelect,
  viewer?: Viewer,
): Promise<RefundDetail> {
  return {
    no: row.no,
    version: row.version,
    kind: row.kind,
    status: row.status,
    refundDate: row.refundDate,
    amountCents: row.amountCents,
    methodName: row.methodName,
    voidReason: row.voidReason,
    id: String(row.id),
    receiptId: row.receiptId === null ? null : String(row.receiptId),
    paymentId: row.paymentId === null ? null : String(row.paymentId),
    note: row.note || null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedBy: await actor(executor, row.voidedBy),
    actions: row.status === 'valid' ? ownActions(viewer, row.createdBy, 'voidRefund') : [],
  }
}

function allocationMetadata(
  row: typeof paymentAllocations.$inferSelect,
  people: Awaited<ReturnType<typeof actors>>,
) {
  return {
    id: String(row.id),
    kind: row.kind,
    createdAt: row.createdAt.toISOString(),
    createdBy: found(people.get(row.createdBy)),
    registeredCents: row.amountCents,
    status: row.revokedAt === null ? ('valid' as const) : ('revoked' as const),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedBy: row.revokedBy === null ? null : (people.get(row.revokedBy) ?? null),
    revokeReason: row.revokeReason,
  }
}
export async function paymentHistory(
  executor: Db | Tx,
  ledger: Awaited<ReturnType<typeof loadPaymentLedger>>,
  viewer?: Viewer,
): Promise<PaymentAllocation[]> {
  const people = await actors(
    executor,
    ledger.allocations.flatMap((row) => [row.createdBy, row.revokedBy]),
  )
  return ledger.allocations.map((row) => ({
    ...allocationMetadata(row, people),
    effectiveCents: ledger.replay.effective.get(row.id) ?? 0,
    actions:
      row.revokedAt === null &&
      ledger.money.some((money) => money.id === row.paymentId && money.status === 'valid')
        ? ownActions(viewer, row.createdBy, 'revokePaymentAllocation')
        : [],
    paymentId: String(row.paymentId),
    paymentNo: ledger.money.find((money) => money.id === row.paymentId)?.no ?? '',
    docType: row.poId === null ? ('wh' as const) : ('po' as const),
    docId: String(row.poId ?? row.whDocId),
    docNo: ledger.docNo(allocationKey(row)),
  }))
}
