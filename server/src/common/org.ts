// 客户和门店的公共查询：往来账（ar:<customerId>）的推送按门店过滤，对账变化通知客户的每家门店。
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

// 行锁客户：同一客户的对账、收款和业务来源改动互斥（05 章第 10 节）。
export async function lockCustomer(tx: Tx, customerId: number): Promise<void> {
  const [row] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update')
  if (!row) throw appError.notFound()
}
