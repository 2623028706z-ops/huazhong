// 游标分页的查询条件：(排序键, id) 小于上一页最后一条（按排序键、id 倒序取）（05 章第 1.3 节）
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { decodeCursor } from './domain/cursor.ts'

export function beforeCursor(
  sortKey: PgColumn,
  id: PgColumn,
  raw: string | undefined,
): SQL | undefined {
  if (raw === undefined) return undefined
  const [key, lastId] = decodeCursor(raw)
  return sql`(${sortKey}, ${id}) < (${key}, ${lastId})`
}
