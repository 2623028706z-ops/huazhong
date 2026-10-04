// 库龄只计算剩余批次的上海业务日期，不改变库存数量。
import { STOCK_AGE_WARNING_DAYS } from '@huazhong/shared'
import { sql, type SQL } from 'drizzle-orm'
import { materials } from '../../../db/schema/index.ts'
const MS_PER_DAY = 86_400_000
export function ageDaysOf(inDate: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(inDate)) / MS_PER_DAY))
}
function oldestStockAge(today: string): SQL<number | null> {
  return sql<number | null>`${today}::date -
    (SELECT min(b.in_date) FROM stock_batches b
     WHERE b.material_id = ${materials.id} AND b.left_qty > 0)`.mapWith(Number)
}
export function agedStockWhere(today: string): SQL {
  return sql`coalesce(${oldestStockAge(today)} >= ${STOCK_AGE_WARNING_DAYS}, false)`
}
