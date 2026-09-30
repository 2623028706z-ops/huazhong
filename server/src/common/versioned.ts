// 条件更新：UPDATE … SET …, version = version + 1 WHERE id = ? AND version = ? [AND 状态条件]，
// 影响 0 行 → STALE（05 章第 1.7 节）。STALE 的句子和 latest 跟着具体单据，由调用处给。
// 版本条件和 version + 1 由这里生成；UPDATE 本身由调用处在具体的表上写，列的类型逐列检查
import { appError } from '@huazhong/shared'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

interface VersionedTable {
  id: PgColumn
  version: PgColumn
}

interface VersionedUpdate<R> {
  table: VersionedTable
  id: number
  version: number
  // 额外的前置条件，例如状态 IN (…)
  where?: SQL
  // 用 where 当 WHERE、用 version 当 version 列的新值
  update: (versioned: { where: SQL; version: SQL }) => Promise<R[]>
  // 被别人改过时：返回最新详情和提示句
  onStale: () => Promise<{ message: string; latest: unknown }>
}

export async function updateVersioned<R>(u: VersionedUpdate<R>): Promise<R> {
  const conditions = [
    eq(u.table.id, u.id),
    eq(u.table.version, u.version),
    ...(u.where ? [u.where] : []),
  ]
  const where = sql.join(conditions, sql` AND `)
  const [row] = await u.update({ where, version: sql`${u.table.version} + 1` })
  if (row) return row
  const stale = await u.onStale()
  throw appError.stale(stale.message, stale.latest)
}
