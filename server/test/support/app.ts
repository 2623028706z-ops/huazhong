// 每个测试一个干净的库（从模板复制）+ 一个真实监听端口的应用，和线上用同一套 configureApp
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { INestApplication, ModuleMetadata } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { eq } from 'drizzle-orm'
import pg from 'pg'
import { inject } from 'vitest'
import { createDb, createPool, type Db } from '../../db/client.ts'
import { seedAccounts, type SeedAccountKey } from '../../db/seed/data.ts'
import { accounts } from '../../db/schema/index.ts'
import { configureApp } from '../../src/app.ts'
import { AppModule } from '../../src/app.module.ts'
import { Clock } from '../../src/common/clock.ts'
import { nestLogger } from '../../src/common/logger.ts'
import { TEMPLATE_DB } from '../global-setup.ts'

export interface TestApp {
  readonly app: INestApplication
  readonly db: Db
  readonly baseUrl: string
  readonly databaseUrl: string
  // 给示例账号绑上一个新的 openid，返回它（种子数据里没有 openid）
  bind(key: SeedAccountKey): Promise<string>
  close(): Promise<void>
}

interface StartOptions {
  imports?: ModuleMetadata['imports']
  clock?: Clock
}

function urlOf(database: string): string {
  const url = new URL(inject('adminUrl'))
  url.pathname = `/${database}`
  return url.toString()
}

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: inject('adminUrl') })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

export async function startApp(options: StartOptions = {}): Promise<TestApp> {
  const database = `hz_${randomUUID().replaceAll('-', '')}`
  await admin(`CREATE DATABASE ${database} TEMPLATE ${TEMPLATE_DB}`)
  const databaseUrl = urlOf(database)
  const env = { DATABASE_URL: databaseUrl, PORT: 0, NODE_ENV: 'test' as const }
  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(env), ...(options.imports ?? [])],
  })
  if (options.clock) builder = builder.overrideProvider(Clock).useValue(options.clock)
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication({ logger: nestLogger })
  configureApp(app)
  await app.listen(0, '127.0.0.1')
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo
  const pool = createPool(databaseUrl)
  const db = createDb(pool)
  return {
    app,
    db,
    baseUrl: `http://127.0.0.1:${port}`,
    databaseUrl,
    async bind(key) {
      const seedAccount = seedAccounts.find((a) => a.key === key)
      if (!seedAccount) throw new Error(`unknown seed account ${key}`)
      const openid = `openid-${key}-${randomUUID()}`
      await db
        .update(accounts)
        .set({ openid, boundAt: new Date() })
        .where(eq(accounts.phone, seedAccount.phone))
      return openid
    },
    async close() {
      await app.close()
      await pool.end()
      await admin(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`)
    },
  }
}
