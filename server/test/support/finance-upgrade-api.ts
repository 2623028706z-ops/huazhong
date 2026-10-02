import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { Test } from '@nestjs/testing'
import { API_PREFIX } from '@huazhong/shared'
import type pg from 'pg'
import { AppModule } from '../../src/app.module.ts'
import { configureApp } from '../../src/app.ts'
import { Clock } from '../../src/common/clock.ts'
import { nestLogger } from '../../src/common/logger.ts'
import { PhoneExchange } from '../../src/modules/accounts/phone.ts'
import { TestClock } from './clock.ts'
import { FakePhoneExchange } from './phone.ts'

export async function upgradedApi(databaseUrl: string, pool: pg.Pool) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ DATABASE_URL: databaseUrl, PORT: 0, NODE_ENV: 'test' })],
  })
    .overrideProvider(Clock)
    .useValue(new TestClock(Date.parse('2026-10-03T04:00:00Z')))
    .overrideProvider(PhoneExchange)
    .useValue(new FakePhoneExchange())
    .compile()
  const app = moduleRef.createNestApplication({ logger: nestLogger })
  configureApp(app)
  await app.listen(0, '127.0.0.1')
  const openid = `upgrade-finance-${randomUUID()}`
  await pool.query("UPDATE accounts SET openid=$1,bound_at=now() WHERE phone='13700000006'", [
    openid,
  ])
  const base = await app.getUrl()
  return {
    async call(method: string, path: string, body?: unknown, key?: string) {
      const response = await fetch(`${base}${API_PREFIX}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          'x-wx-openid': openid,
          ...(key ? { 'x-idempotency-key': key } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      return {
        status: response.status,
        body: (await response.json()) as { ok: boolean; data?: unknown; error?: { code: string } },
      }
    },
    async close() {
      await app.close()
    },
  }
}
