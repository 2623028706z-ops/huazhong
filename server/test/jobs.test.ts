// 后台任务：启动时登记每天清理幂等键；清理只删过期的（04 章第 3.4 节）
import { randomUUID } from 'node:crypto'
import { IDEMPOTENCY_TTL_HOURS } from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { accounts, idempotencyKeys } from '../db/schema/index.ts'
import { deleteExpiredIdempotencyKeys } from '../src/jobs/cleanup.ts'
import { CLEANUP_QUEUE } from '../src/jobs/jobs.service.ts'
import { startApp, type TestApp } from './support/app.ts'

let t: TestApp
beforeEach(async () => {
  t = await startApp()
})
afterEach(async () => {
  await t.close()
})

test('启动后登记了每天的清理任务', async () => {
  const result = await t.db.execute<{ name: string }>(sql`SELECT name FROM pgboss.schedule`)
  expect(result.rows.map((row) => row.name)).toContain(CLEANUP_QUEUE)
})

test('只删超过保留时间的幂等键', async () => {
  const [admin] = await t.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.phone, '13700000001'))
  const accountId = admin?.id ?? 0
  const now = new Date('2026-09-30T02:00:00.000Z')
  const hours = (h: number) => new Date(now.getTime() - h * 3_600_000)
  await t.db.insert(idempotencyKeys).values([
    {
      accountId,
      key: randomUUID(),
      endpoint: 'POST /x',
      createdAt: hours(IDEMPOTENCY_TTL_HOURS + 1),
    },
    {
      accountId,
      key: randomUUID(),
      endpoint: 'POST /x',
      createdAt: hours(IDEMPOTENCY_TTL_HOURS - 1),
    },
  ])
  expect(await deleteExpiredIdempotencyKeys(t.db, now)).toBe(1)
  expect(await t.db.select().from(idempotencyKeys)).toHaveLength(1)
})
