// 清理过期的幂等键（04 章第 3.4 节：保留 IDEMPOTENCY_TTL_HOURS）
import { IDEMPOTENCY_TTL_HOURS } from '@huazhong/shared'
import { lt } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { idempotencyKeys } from '../../db/schema/index.ts'

const MS_PER_HOUR = 3_600_000

export async function deleteExpiredIdempotencyKeys(db: Db, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_HOURS * MS_PER_HOUR)
  const deleted = await db
    .delete(idempotencyKeys)
    .where(lt(idempotencyKeys.createdAt, cutoff))
    .returning({ key: idempotencyKeys.key })
  return deleted.length
}
