// 本地开发：迁移 + 写入示例数据（pnpm --filter @huazhong/server db:reset）
import { createDb, createPool } from '../client.ts'
import { runMigrations } from '../migrate.ts'
import { seed } from './seed.ts'

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) throw new Error('DATABASE_URL is required')

const pool = createPool(databaseUrl)
const db = createDb(pool)
await runMigrations(db)
await seed(db)
await pool.end()
console.log('migrated and seeded')
