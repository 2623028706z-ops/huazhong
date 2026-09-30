// 数据库连接：列名在库里是 snake_case，代码里是 camelCase，只在这里转换一次
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.ts'

export type Db = NodePgDatabase<typeof schema>
// 事务里拿到的连接，和 Db 的查询写法一样
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl })
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema, casing: 'snake_case' })
}
