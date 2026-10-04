import { eq, inArray, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  accounts,
  materials,
  invites,
  type purchaseOrderLines,
  type purchaseOrders,
  stockBatches,
} from '../../../db/schema/index.ts'

type Line = typeof purchaseOrderLines.$inferSelect
function lineView(
  line: Line,
  stock: ReadonlyMap<number, number>,
  codes: ReadonlyMap<number, string>,
) {
  return {
    id: String(line.id),
    materialId: String(line.materialId),
    code: codes.get(line.materialId) ?? '',
    name: line.name,
    unit: line.unit,
    qty: line.qty,
    orderPriceCents: line.orderPriceCents,
    priceCents: line.priceCents,
    receivedQty: line.receivedQty,
    returnedQty: line.returnedQty,
    maxReturnQty:
      line.receivedQty === null
        ? null
        : Math.min(line.receivedQty - line.returnedQty, stock.get(line.materialId) ?? 0),
  }
}
export async function poExtras(
  executor: Db | Tx,
  po: typeof purchaseOrders.$inferSelect,
  lines: Line[],
) {
  const stocks = await executor
    .select({
      materialId: stockBatches.materialId,
      qty: sql<number>`sum(${stockBatches.leftQty})`.mapWith(Number),
    })
    .from(stockBatches)
    .where(
      inArray(
        stockBatches.materialId,
        lines.map((line) => line.materialId),
      ),
    )
    .groupBy(stockBatches.materialId)
  const materialCodes = await executor
    .select({ id: materials.id, code: materials.code })
    .from(materials)
    .where(
      inArray(
        materials.id,
        lines.map((line) => line.materialId),
      ),
    )
  const codeMap = new Map(materialCodes.map((row) => [row.id, row.code]))
  const stockMap = new Map(stocks.map((stock) => [stock.materialId, stock.qty]))
  const [invite] =
    po.inviteId === null
      ? []
      : await executor.select({ no: invites.no }).from(invites).where(eq(invites.id, po.inviteId))
  const [receiver] =
    po.receivedBy === null
      ? []
      : await executor
          .select({ name: accounts.name })
          .from(accounts)
          .where(eq(accounts.id, po.receivedBy))
  return {
    inviteId: po.inviteId === null ? null : String(po.inviteId),
    inviteNo: invite?.no ?? null,
    receivedAt: po.receivedAt?.toISOString() ?? null,
    receivedBy: receiver?.name ?? null,
    lines: lines.map((line) => lineView(line, stockMap, codeMap)),
  }
}
