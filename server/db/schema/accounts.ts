// 账号和员工模块（04 章第 3.1、3.2 节）
import { PHONE_PATTERN } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { commonColumns, timestamptz, versionColumn } from './columns.ts'
import { accountType, moduleKey } from './enums.ts'
import { stores, suppliers } from './org.ts'

export const accounts = pgTable(
  'accounts',
  {
    ...commonColumns(),
    version: versionColumn(),
    type: accountType().notNull(),
    name: text().notNull(),
    phone: text().notNull(),
    openid: text(),
    storeId: bigint({ mode: 'number' }).references(() => stores.id, { onDelete: 'restrict' }),
    supplierId: bigint({ mode: 'number' }).references(() => suppliers.id, { onDelete: 'restrict' }),
    enabled: boolean().notNull().default(true),
    boundAt: timestamptz(),
  },
  (t) => [
    check('accounts_phone_format', sql`${t.phone} ~ ${sql.raw(`'${PHONE_PATTERN}'`)}`),
    check('accounts_store_link', sql`(${t.type} = 'store') = (${t.storeId} IS NOT NULL)`),
    check('accounts_supplier_link', sql`(${t.type} = 'supplier') = (${t.supplierId} IS NOT NULL)`),
    uniqueIndex('accounts_enabled_phone')
      .on(t.phone)
      .where(sql`${t.enabled}`),
    uniqueIndex('accounts_openid')
      .on(t.openid)
      .where(sql`${t.openid} IS NOT NULL`),
    uniqueIndex('accounts_one_per_store')
      .on(t.storeId)
      .where(sql`${t.type} = 'store' AND ${t.enabled}`),
    uniqueIndex('accounts_one_per_supplier')
      .on(t.supplierId)
      .where(sql`${t.type} = 'supplier' AND ${t.enabled}`),
  ],
)

// 只允许 type='staff' 的账号（服务层校验）；管理员不写这张表，默认全部模块
export const accountModules = pgTable(
  'account_modules',
  {
    accountId: bigint({ mode: 'number' })
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    module: moduleKey().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.module] })],
)
