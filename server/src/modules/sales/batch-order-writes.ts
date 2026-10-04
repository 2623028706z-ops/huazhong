import { AppError, type contract, type OutputOf } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { orders } from '../../../db/schema/index.ts'

export async function batchOrders(
  db: Db,
  ordersToWrite: { id: string; version: number }[],
  write: (order: { id: string; version: number }) => Promise<{ id: string; no: string }>,
): Promise<OutputOf<typeof contract.batchShipOrders>> {
  const result: OutputOf<typeof contract.batchShipOrders> = { succeeded: [], failed: [] }
  for (const order of ordersToWrite) {
    try {
      const item = await write(order)
      result.succeeded.push({ id: item.id, no: item.no })
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      const latest = error.latest as { no?: string } | null
      const [row] = latest?.no
        ? []
        : await db
            .select({ no: orders.no })
            .from(orders)
            .where(eq(orders.id, Number(order.id)))
      result.failed.push({ id: order.id, no: latest?.no ?? row?.no ?? '', reason: error.message })
    }
  }
  return result
}
