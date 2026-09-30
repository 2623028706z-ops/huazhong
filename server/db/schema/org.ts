// 客户、门店、供应商：阶段 0 只建账号外键要用的列（名称、归属、启用），其余列在阶段 3、4 加（08 章）
import { bigint, boolean, pgTable, text, unique } from 'drizzle-orm/pg-core'
import { commonColumns } from './columns.ts'

export const customers = pgTable('customers', {
  ...commonColumns(),
  name: text().notNull().unique(),
  enabled: boolean().notNull().default(true),
})

export const stores = pgTable(
  'stores',
  {
    ...commonColumns(),
    customerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    enabled: boolean().notNull().default(true),
  },
  (t) => [unique().on(t.customerId, t.name)],
)

export const suppliers = pgTable('suppliers', {
  ...commonColumns(),
  name: text().notNull().unique(),
  enabled: boolean().notNull().default(true),
})
