import { sql } from 'drizzle-orm'
// 客户、门店、供应商（04 章第 4.1、5.1 节）。供应商的其余列在阶段 4 加（08 章）。
// 门店的联系人、电话、地址没填就是空字符串（04 章第 10 节）
import { bigint, boolean, check, integer, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { commonColumns, versionColumn } from './columns.ts'

export const customers = pgTable(
  'customers',
  {
    ...commonColumns(),
    version: versionColumn(),
    name: text().notNull().unique(),
    enabled: boolean().notNull().default(true),
    termDays: integer(),
    openingDebtCents: integer().notNull().default(0),
  },
  (t) => [
    check('customers_terms_nonnegative', sql`${t.termDays} IS NULL OR ${t.termDays}>=0`),
    check('customers_opening_nonnegative', sql`${t.openingDebtCents}>=0`),
  ],
)

export const stores = pgTable(
  'stores',
  {
    ...commonColumns(),
    version: versionColumn(),
    customerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    contact: text().notNull().default(''),
    phone: text().notNull().default(''),
    address: text().notNull().default(''),
    enabled: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.customerId, t.name)],
)

export const suppliers = pgTable(
  'suppliers',
  {
    ...commonColumns(),
    version: versionColumn(),
    name: text().notNull().unique(),
    contact: text().notNull().default(''),
    phone: text().notNull().default(''),
    address: text().notNull().default(''),
    enabled: boolean().notNull().default(true),
    termDays: integer(),
    openingDebtCents: integer().notNull().default(0),
  },
  (t) => [
    check('suppliers_terms_nonnegative', sql`${t.termDays} IS NULL OR ${t.termDays}>=0`),
    check('suppliers_opening_nonnegative', sql`${t.openingDebtCents}>=0`),
  ],
)
