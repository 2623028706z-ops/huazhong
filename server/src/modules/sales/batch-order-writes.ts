import { AppError, type contract, type OutputOf } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { customers, orders, stores } from '../../../db/schema/index.ts'

type Written = { id: string; no: string; customerName: string; storeName: string }

// 失败单的单号、客户、门店（结果弹层每行「客户 · 门店 / 单号」）；单不存在时为空串
async function labelsOf(db: Db, id: string) {
  const [row] = await db
    .select({ no: orders.no, customerName: customers.name, storeName: stores.name })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, Number(id)))
  return row ?? { no: '', customerName: '', storeName: '' }
}

export async function batchOrders(
  db: Db,
  ordersToWrite: { id: string; version: number }[],
  write: (order: { id: string; version: number }) => Promise<Written>,
): Promise<OutputOf<typeof contract.batchShipOrders>> {
  const result: OutputOf<typeof contract.batchShipOrders> = { succeeded: [], failed: [] }
  for (const order of ordersToWrite) {
    try {
      const item = await write(order)
      result.succeeded.push({
        id: item.id,
        no: item.no,
        customerName: item.customerName,
        storeName: item.storeName,
      })
    } catch (error) {
      if (!(error instanceof AppError)) throw error
      result.failed.push({ id: order.id, ...(await labelsOf(db, order.id)), reason: error.message })
    }
  }
  return result
}
