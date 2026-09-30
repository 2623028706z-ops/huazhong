// 执行 db/migrations 里 Drizzle Kit 生成的迁移（接口测试的模板库也用这里）
import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.ts'

const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations')

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}
