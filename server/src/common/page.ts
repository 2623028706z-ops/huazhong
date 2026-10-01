// 游标分页的查询条件（05 章第 1.3 节）：游标是上一页最后一条的 (排序键, id)
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { decodeCursor, type Cursor } from './domain/cursor.ts'

// 前端带回的原样游标，或调用方已经解开的 (排序键, id)
type CursorInput = string | Cursor | undefined

function cursorOf(input: Exclude<CursorInput, undefined>): Cursor {
  return typeof input === 'string' ? decodeCursor(input) : input
}

// 按排序键、id 倒序取：(排序键, id) 小于上一页最后一条
export function beforeCursor(sortKey: PgColumn, id: PgColumn, raw: CursorInput): SQL | undefined {
  if (raw === undefined) return undefined
  const [key, lastId] = cursorOf(raw)
  return sql`(${sortKey}, ${id}) < (${key}, ${lastId})`
}

// 日期筛选 ?from=&to=：两头都含，都不传 = 全部（05 章第 1.3 节）
export function dateBetween(
  column: PgColumn,
  range: { from?: string | undefined; to?: string | undefined },
): SQL | undefined {
  const parts: SQL[] = []
  if (range.from !== undefined) parts.push(sql`${column} >= ${range.from}`)
  if (range.to !== undefined) parts.push(sql`${column} <= ${range.to}`)
  return parts.length === 0 ? undefined : sql.join(parts, sql` AND `)
}

// 按排序键、id 升序取：(排序键, id) 大于上一页最后一条
export function afterCursor(sortKey: PgColumn, id: PgColumn, raw: CursorInput): SQL | undefined {
  if (raw === undefined) return undefined
  const [key, lastId] = cursorOf(raw)
  return sql`(${sortKey}, ${id}) > (${key}, ${lastId})`
}
