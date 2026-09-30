// 接口测试的数据库：起一个 PostgreSQL 容器，建模板库（迁移 + 示例数据 + pg-boss 的表），
// 每个测试从模板复制一个干净的库（support/app.ts）
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PgBoss } from 'pg-boss'
import pg from 'pg'
import type { TestProject } from 'vitest/node'
import { createDb, createPool } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { seed } from '../db/seed/seed.ts'

export const TEMPLATE_DB = 'hz_template'
// 本机镜像源拉不到 17，先用本机已有的 16；云上 PostgreSQL 的版本到阶段 6 部署时再核对、对齐
const POSTGRES_IMAGE = 'postgres:16-alpine'

declare module 'vitest' {
  export interface ProvidedContext {
    adminUrl: string
  }
}

function urlFor(container: StartedPostgreSqlContainer, database: string): string {
  const url = new URL(container.getConnectionUri())
  url.pathname = `/${database}`
  return url.toString()
}

async function buildTemplate(url: string): Promise<void> {
  const pool = createPool(url)
  await runMigrations(createDb(pool))
  await seed(createDb(pool))
  await pool.end()
  const boss = new PgBoss(url)
  await boss.start()
  await boss.stop({ graceful: false })
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start()
  const adminUrl = urlFor(container, 'postgres')
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB}`)
  await admin.end()
  await buildTemplate(urlFor(container, TEMPLATE_DB))
  project.provide('adminUrl', adminUrl)
  return async () => {
    await container.stop()
  }
}
