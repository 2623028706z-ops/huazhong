// 客户和门店的公共查询：应收（ar:<customerId>）的推送按门店过滤，核销重算可能影响这个客户的每家门店
import { appError } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import { customers, stores } from '../../db/schema/index.ts'

export async function customerStoreIds(executor: Db | Tx, customerId: number): Promise<string[]> {
  const rows = await executor
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.customerId, customerId))
  return rows.map((row) => String(row.id))
}

// 行锁客户：串行化同一客户的核销，登记收款、作废收款、作废售后互斥（05 章第 10 节）
export async function lockCustomer(tx: Tx, customerId: number): Promise<void> {
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update')
  if (!row) throw appError.notFound()
}
