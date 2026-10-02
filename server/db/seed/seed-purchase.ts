import { eq } from 'drizzle-orm'
import type { Tx } from '../client.ts'
import {
  invites,
  inviteLines,
  inviteSupplyLines,
  purchaseOrders,
  purchaseOrderLines,
  stockBatches,
  stockMoves,
} from '../schema/index.ts'
import { seedMaterials } from './data.ts'
import { idOf, insertDocSequences } from './seed-sales.ts'

interface Ids {
  admin: number
  accounts: Map<string, number>
  suppliers: Map<string, number>
  materials: Map<string, number>
}
const DATE = '2026-09-29'
const RECEIVED = new Date('2026-09-28T22:50:00.000Z')
const POS = [
  {
    no: 'PO-260929-007',
    date: DATE,
    supplier: 'sp2',
    invite: null,
    received: false,
    lines: [
      { material: 'w2', qty: 150, price: 900 },
      { material: 'w4', qty: 100, price: 800 },
    ],
  },
  {
    no: 'PO-260929-006',
    date: DATE,
    supplier: 'sp1',
    invite: 'YQ-260928-001',
    received: false,
    lines: [{ material: 'w1', qty: 200, price: 1420 }],
  },
  {
    no: 'PO-260928-004',
    date: '2026-09-28',
    supplier: 'sp2',
    invite: null,
    received: true,
    lines: [{ material: 'w5', qty: 120, price: 800 }],
  },
] as const
async function insertInvites(tx: Tx, ids: Ids) {
  const result = new Map<string, number>()
  const input = [
    { no: 'YQ-260929-001', inviteDate: DATE, material: 'w3', needQty: 60, submittedAt: null },
    {
      no: 'YQ-260928-001',
      inviteDate: '2026-09-28',
      material: 'w1',
      needQty: 180,
      submittedAt: new Date('2026-09-29T00:05:00.000Z'),
    },
  ]
  for (const i of input) {
    const mat = seedMaterials.find((m) => m.key === i.material)
    if (!mat) throw new Error(`unknown seed material ${i.material}`)
    const [row] = await tx
      .insert(invites)
      .values({
        no: i.no,
        inviteDate: i.inviteDate,
        supplierId: idOf(ids.suppliers, 'sp1'),
        buyerId: idOf(ids.accounts, 'u4'),
        status: i.submittedAt === null ? 'pending' : 'submitted',
        submittedAt: i.submittedAt,
        createdBy: idOf(ids.accounts, 'u4'),
      })
      .returning()
    if (!row) throw new Error('seed invite insert failed')
    result.set(i.no, row.id)
    await tx.insert(inviteLines).values({
      inviteId: row.id,
      materialId: idOf(ids.materials, i.material),
      name: mat.name,
      unit: mat.unit,
      needQty: i.needQty,
      sort: 0,
      createdBy: row.createdBy,
    })
    if (i.submittedAt !== null) await insertSeedSupply(tx, ids, row.id, mat)
  }
  return result
}
async function insertSeedSupply(
  tx: Tx,
  ids: Ids,
  inviteId: number,
  mat: { name: string; unit: string },
) {
  await tx.insert(inviteSupplyLines).values({
    inviteId,
    materialId: idOf(ids.materials, 'w1'),
    name: mat.name,
    unit: mat.unit,
    qty: 200,
    priceCents: 1420,
    sort: 0,
    createdBy: idOf(ids.accounts, 'p1'),
  })
}
async function linkReceivedBatch(tx: Tx, ids: Ids, po: { id: number; no: string }) {
  const [batch] = await tx
    .update(stockBatches)
    .set({ sourceType: 'po', sourceId: po.id })
    .where(eq(stockBatches.materialId, idOf(ids.materials, 'w5')))
    .returning()
  if (!batch) throw new Error('seed received batch not found')
  await tx.insert(stockMoves).values({
    movedAt: RECEIVED,
    type: 'po_in',
    materialId: batch.materialId,
    batchId: batch.id,
    qty: batch.qty,
    docType: 'po',
    docId: po.id,
    docNo: po.no,
    createdBy: idOf(ids.accounts, 'u5'),
  })
}
export async function insertPurchase(tx: Tx, ids: Ids) {
  const inviteIds = await insertInvites(tx, ids)
  for (const p of POS) {
    const [row] = await tx
      .insert(purchaseOrders)
      .values({
        no: p.no,
        orderDate: p.date,
        supplierId: idOf(ids.suppliers, p.supplier),
        buyerId: idOf(ids.accounts, 'u4'),
        inviteId: p.invite === null ? null : idOf(inviteIds, p.invite),
        status: p.received ? 'received' : 'to_receive',
        receivedAt: p.received ? RECEIVED : null,
        receivedBy: p.received ? idOf(ids.accounts, 'u5') : null,
        createdBy: idOf(ids.accounts, 'u4'),
      })
      .returning()
    if (!row) throw new Error('seed po insert failed')
    await tx.insert(purchaseOrderLines).values(
      p.lines.map((line, sort) => {
        const mat = seedMaterials.find((m) => m.key === line.material)
        if (!mat) throw new Error(`unknown seed material ${line.material}`)
        return {
          poId: row.id,
          materialId: idOf(ids.materials, line.material),
          name: mat.name,
          unit: mat.unit,
          qty: line.qty,
          orderPriceCents: line.price,
          priceCents: line.price,
          receivedQty: p.received ? line.qty : null,
          sort,
          createdBy: row.createdBy,
        }
      }),
    )
    if (p.received) await linkReceivedBatch(tx, ids, row)
  }
  await insertDocSequences(tx, [...POS.map((p) => p.no), ...inviteIds.keys()])
}
