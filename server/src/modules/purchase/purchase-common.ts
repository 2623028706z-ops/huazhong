import { appError, copy, type Topic } from '@huazhong/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import {
  accounts,
  materials,
  purchaseOrderLines,
  purchaseOrders,
  suppliers,
} from '../../../db/schema/index.ts'
import { found } from '../../common/scope.ts'
import type { WriteContext } from '../../common/write.service.ts'
import { lockSupplierLedger } from '../../common/statements.ts'

export async function lockPo(tx: Tx, id: number, nextSupplierId?: number) {
  const [pointer] = await tx
    .select({ supplierId: purchaseOrders.supplierId })
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
  const supplierId = found(pointer).supplierId
  for (const ownerId of [
    ...new Set([supplierId, ...(nextSupplierId === undefined ? [] : [nextSupplierId])]),
  ].sort((a, b) => a - b))
    await lockSupplierLedger(tx, ownerId)
  const [row] = await tx
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, id))
    .for('update')
  const current = found(row)
  if (current.supplierId !== supplierId) throw appError.stale(copy.finance.poStale, null)
  return current
}
export async function lockSupplier(tx: Tx, id: number, accountRequired = false) {
  const [row] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).for('update')
  const supplier = found(row)
  if (!supplier.enabled) throw appError.businessRule(copy.error.supplierDisabled)
  if (accountRequired) {
    const [account] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.supplierId, id), eq(accounts.enabled, true)))
    if (!account) throw appError.businessRule(copy.finance.inviteSupplierAccount)
  }
  return supplier
}
export async function materialSnapshots(
  tx: Tx,
  ids: readonly string[],
  retained: readonly number[] = [],
) {
  const rows = await tx
    .select()
    .from(materials)
    .where(inArray(materials.id, ids.map(Number)))
    .orderBy(asc(materials.id))
    .for('share')
  const byId = new Map(rows.map((row) => [String(row.id), row]))
  if (
    rows.length !== ids.length ||
    rows.some((row) => !row.enabled && !retained.includes(row.id))
  ) {
    throw appError.businessRule(copy.finance.materialDisabled)
  }
  return ids.map((id) => found(byId.get(id)))
}
export async function insertPoLines(
  ctx: WriteContext,
  poId: number,
  lines: readonly { materialId: string; qty: number; priceCents: number }[],
  retained: readonly { materialId: number; name: string; unit: string }[] = [],
) {
  const mats = await materialSnapshots(
    ctx.tx,
    lines.map((line) => line.materialId),
    retained.map((row) => row.materialId),
  )
  const previous = new Map(retained.map((row) => [row.materialId, row]))
  await ctx.tx.insert(purchaseOrderLines).values(
    lines.map((line, sort) => ({
      poId,
      materialId: Number(line.materialId),
      name: previous.get(Number(line.materialId))?.name ?? found(mats[sort]).name,
      unit: previous.get(Number(line.materialId))?.unit ?? found(mats[sort]).unit,
      qty: line.qty,
      orderPriceCents: line.priceCents,
      priceCents: line.priceCents,
      sort,
      createdBy: ctx.viewer?.accountId ?? 0,
    })),
  )
}
export function notifyPo(
  ctx: WriteContext,
  row: { id: number; version: number; supplierId: number; inviteId?: number | null },
  otherSupplier?: number,
) {
  const topics: Topic[] = [
    `po:${row.id}`,
    'pos',
    'demand',
    'stock',
    'todo:warehouse',
    'todo:finance',
    'todo:purchase',
    `payable:po:${row.id}`,
    `ap:${row.supplierId}`,
    `supplier:${row.supplierId}`,
  ]
  if (row.inviteId != null) topics.push(`invite:${row.inviteId}`, 'invites')
  if (otherSupplier !== undefined) topics.push(`supplier:${otherSupplier}`)
  ctx.notify(
    topics.map((topic) => ({ topic, version: topic === `po:${row.id}` ? row.version : null })),
    {
      supplierIds: [
        String(row.supplierId),
        ...(otherSupplier === undefined ? [] : [String(otherSupplier)]),
      ],
    },
  )
}
