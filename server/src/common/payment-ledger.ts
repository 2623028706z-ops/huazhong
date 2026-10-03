// 供应商付款账本：应付单据 = 有效已收货采购单 + 已入库手工入库单（04 章第 8 节）；
// 核销按登记先后重算，单据键用 'po:<id>' / 'wh:<id>' 区分两种单据
import { shanghaiDateOf } from '@huazhong/shared'
import { and, asc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import {
  payments,
  paymentAllocations,
  purchaseOrders,
  purchaseOrderLines,
  refunds,
  whDocLines,
  whDocs,
} from '../../db/schema/index.ts'
import { replayLedger } from './domain/ledger.ts'
import { ledgerToken } from './ledger.ts'

export type ApDocType = 'po' | 'wh'
export type ApKey = `${ApDocType}:${number}`
export function apKey(docType: ApDocType, id: number | string): ApKey {
  return `${docType}:${Number(id)}`
}
export function allocationKey(row: { poId: number | null; whDocId: number | null }): ApKey {
  return row.poId === null ? apKey('wh', row.whDocId ?? 0) : apKey('po', row.poId)
}

async function paymentDocuments(executor: Db | Tx, supplierId: number) {
  const pos = await executor
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.supplierId, supplierId))
    .orderBy(asc(purchaseOrders.id))
  const poLines = await executor
    .select({ line: purchaseOrderLines })
    .from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(eq(purchaseOrders.supplierId, supplierId))
  const whs = await executor
    .select()
    .from(whDocs)
    .where(and(eq(whDocs.kind, 'in'), eq(whDocs.supplierId, supplierId)))
    .orderBy(asc(whDocs.id))
  const whLines = await executor
    .select({ line: whDocLines })
    .from(whDocLines)
    .innerJoin(whDocs, eq(whDocs.id, whDocLines.docId))
    .where(and(eq(whDocs.kind, 'in'), eq(whDocs.supplierId, supplierId)))
  return { pos, poLines, whs, whLines }
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

interface ApDoc {
  key: ApKey
  docType: ApDocType
  id: number
  no: string
  version: number
  // 收货日期（采购单 received_at 的上海日期）/ 入库日期
  apDate: string
  payableCents: number
}
// 进账本的单据：有效已收货采购单、已入库手工入库单（作废、拒收、取消的不算应付）
function apDocuments({ pos, poLines, whs, whLines }: Awaited<ReturnType<typeof paymentDocuments>>) {
  const poDocs: ApDoc[] = pos
    .filter((row) => row.status === 'received')
    .map((row) => ({
      key: apKey('po', row.id),
      docType: 'po',
      id: row.id,
      no: row.no,
      version: row.version,
      apDate: row.receivedAt ? shanghaiDateOf(row.receivedAt.getTime()) : row.orderDate,
      payableCents: poLines
        .filter((item) => item.line.poId === row.id)
        .reduce(
          (total, item) =>
            total + ((item.line.receivedQty ?? 0) - item.line.returnedQty) * item.line.priceCents,
          0,
        ),
    }))
  const whDocsIn: ApDoc[] = whs
    .filter((row) => row.status === 'stocked_in')
    .map((row) => ({
      key: apKey('wh', row.id),
      docType: 'wh',
      id: row.id,
      no: row.no,
      version: row.version,
      apDate: row.docDate,
      payableCents: whLines
        .filter((item) => item.line.docId === row.id)
        .reduce((total, item) => total + item.line.qty * (item.line.priceCents ?? 0), 0),
    }))
  return [...poDocs, ...whDocsIn]
}

export async function loadPaymentLedger(executor: Db | Tx, supplierId: number) {
  const documents = await paymentDocuments(executor, supplierId)
  const { money, allocations, refundList } = await paymentFunds(executor, supplierId)
  const docs = apDocuments(documents)
  const valid = new Set(money.filter((row) => row.status === 'valid').map((row) => row.id))
  const replay = replayLedger<ApKey>(
    docs.map((doc) => ({ orderId: doc.key, shippedCents: doc.payableCents, afterCents: 0 })),
    money.filter((row) => valid.has(row.id)).map((row) => ({ ...row, receiptDate: row.payDate })),
    allocations
      .filter((row) => valid.has(row.paymentId) && row.revokedAt === null)
      .map((row) => ({ ...row, receiptId: row.paymentId, orderId: allocationKey(row) })),
    refundList
      .filter((row) => row.status === 'valid')
      .map((row) => ({ receiptId: row.paymentId ?? 0, amountCents: row.amountCents })),
  )
  const cards = docs.map((doc) => {
    const paidCents = replay.received.get(doc.key) ?? 0
    return {
      ...doc,
      paidCents,
      unpaidCents: Math.max(doc.payableCents - paidCents, 0),
    }
  })
  return {
    supplierId,
    pos: documents.pos,
    whs: documents.whs,
    money,
    allocations,
    refunds: refundList,
    replay,
    cards,
    card: (docType: ApDocType, id: number | string) =>
      cards.find((card) => card.key === apKey(docType, id)),
    // 单号：核销历史里的单据可能已作废，按全部单据查
    docNo: (key: ApKey) => {
      const [type, id] = key.split(':')
      const rows = type === 'po' ? documents.pos : documents.whs
      return rows.find((row) => row.id === Number(id))?.no ?? ''
    },
    prepaidCents: [...replay.left.values()].reduce((sum, amount) => sum + amount, 0),
    token: ledgerToken({ documents, money, allocations, refunds: refundList }),
  }
}
export type PaymentLedger = Awaited<ReturnType<typeof loadPaymentLedger>>

// 单据的付款状态：应付 0 无需付款；待付 0 已付；已付 > 0 部分付；否则未付
export function apStatusOf(card: { payableCents: number; paidCents: number; unpaidCents: number }) {
  if (card.payableCents === 0) return 'no_pay' as const
  if (card.unpaidCents === 0) return 'paid' as const
  return card.paidCents > 0 ? ('partial' as const) : ('unpaid' as const)
}
