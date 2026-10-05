// 「有新结果、还没看过」（2026-10-06 第 3 批）：结果时间晚于看过时间。采购单差异、门店的订单 / 售后结果共用
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

export function unseenOf(
  noticeAt: Date | null | undefined,
  seenAt: Date | null | undefined,
): boolean {
  return noticeAt != null && (seenAt == null || seenAt < noticeAt)
}

export function unseenWhere(noticeAt: PgColumn, seenAt: PgColumn): SQL {
  return sql`(${noticeAt} IS NOT NULL AND (${seenAt} IS NULL OR ${seenAt} < ${noticeAt}))`
}
