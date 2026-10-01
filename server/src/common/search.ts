// 列表搜索：ILIKE，搜索词里的 % _ \ 当普通字符
import { ilike, or, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

// 任一列包含搜索词；没有搜索词不加条件
export function searchAny(q: string | undefined, columns: readonly PgColumn[]): SQL | undefined {
  if (!q) return undefined
  const pattern = likePattern(q)
  return or(...columns.map((column) => ilike(column, pattern)))
}
