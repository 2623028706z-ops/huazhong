import { found } from './scope.ts'
import { asc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import {
  payments,
  paymentAllocations,
  purchaseOrders,
  purchaseOrderLines,
  refunds,
} from '../../db/schema/index.ts'
import { replayLedger } from './domain/ledger.ts'
import { ledgerToken } from './ledger.ts'

async function paymentDocuments(executor: Db | Tx, supplierId: number) {
  const docs = await executor
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, supplierId))
    .orderBy(asc(purchaseOrders.id))
  const lines = await executor
    .select({ line: purchaseOrderLines })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(eq(purchaseOrders.supplierId, supplierId))
  return { docs, lines }
}

async function paymentFunds(executor: Db | Tx, supplierId: number) {
  const money = await executor
    .select()
    .from(payments)
    .where(eq(payments.supplierId, supplierId))
    .orderBy(asc(payments.createdAt), asc(payments.id))
  const allAllocations = await executor
    .select({ allocation: paymentAllocations })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(eq(payments.supplierId, supplierId))
    .orderBy(asc(paymentAllocations.createdAt), asc(paymentAllocations.id))
  const refundRows = await executor
    .select({ refund: refunds })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(payments.supplierId, supplierId))
    .orderBy(asc(refunds.createdAt), asc(refunds.id))
  return {
    money,
    allocations: allAllocations.map((row) => row.allocation),
    refundList: refundRows.map((row) => row.refund),
  }
}

function paymentOrders({ docs, lines }: Awaited<ReturnType<typeof paymentDocuments>>) {
  return docs
    .filter((row) => row.status === 'received')
    .map((row) => ({
      orderId: row.id,
      orderNo: row.no,
      storeId: 0,
      storeName: '',
      shipDate: row.orderDate,
      units: [],
      afterCents: 0,
      shippedCents: lines
        .filter((item) => item.line.poId === row.id)
        .reduce(
          (total, item) =>
            total + ((item.line.receivedQty ?? 0) - item.line.returnedQty) * item.line.priceCents,
          0,
        ),
    }))
}

export async function loadPaymentLedger(executor: Db | Tx, supplierId: number) {
  const documents = await paymentDocuments(executor, supplierId)
  const { docs } = documents
  const { money, allocations, refundList } = await paymentFunds(executor, supplierId)
  const orders = paymentOrders(documents)
  const valid = new Set(money.filter((row) => row.status === 'valid').map((row) => row.id))
  const replay = replayLedger(
    orders,
    money.filter((row) => valid.has(row.id)).map((row) => ({ ...row, receiptDate: row.payDate })),
    allocations
      .filter((row) => valid.has(row.paymentId) && row.revokedAt === null)
      .map((row) => ({ ...row, receiptId: row.paymentId, orderId: row.poId ?? 0 })),
    refundList
      .filter((row) => row.status === 'valid')
      .map((row) => ({ receiptId: row.paymentId ?? 0, amountCents: row.amountCents })),
  )
  const cards = orders.map((order) => {
    const doc = found(docs.find((row) => row.id === order.orderId))
    const paidCents = replay.received.get(order.orderId) ?? 0
    return {
      id: String(doc.id),
      version: doc.version,
      orderDate: doc.orderDate,
      payableCents: order.shippedCents,
      paidCents,
      unpaidCents: Math.max(order.shippedCents - paidCents, 0),
    }
  })
  return {
    supplierId,
    docs,
    money,
    allocations,
    refunds: refundList,
    replay,
    cards,
    prepaidCents: [...replay.left.values()].reduce((sum, amount) => sum + amount, 0),
    token: ledgerToken({ docs, lines: documents.lines, money, allocations, refunds: refundList }),
  }
}
