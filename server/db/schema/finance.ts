// 收付款方式、收款、核销（04 章第 7 节）。付款表在阶段 4 加（08 章）
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core'
import { accountRef, commonColumns, timestamptz, versionColumn } from './columns.ts'
import { allocKind, methodKind, recordStatus } from './enums.ts'
import { customers } from './org.ts'
import { orders } from './sales.ts'

// 收款方式、付款方式分两份；每份至少一种启用（服务层）
export const paymentMethods = pgTable(
  'payment_methods',
  {
    ...commonColumns(),
    kind: methodKind().notNull(),
    name: text().notNull(),
    enabled: boolean().notNull().default(true),
    sort: integer().notNull().default(0),
  },
  (t) => [unique().on(t.kind, t.name)],
)

export const receipts = pgTable(
  'receipts',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    receiptDate: date({ mode: 'string' }).notNull(),
    customerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    amountCents: integer().notNull(),
    // 快照：登记时必须是启用的收款方式
    methodName: text().notNull(),
    note: text().notNull().default(''),
    status: recordStatus().notNull().default('valid'),
    voidReason: text(),
    voidedBy: accountRef(),
    voidedAt: timestamptz(),
  },
  (t) => [
    check('receipts_amount_positive', sql`${t.amountCents} > 0`),
    check('receipts_void_reason', sql`${t.status} <> 'voided' OR ${t.voidReason} IS NOT NULL`),
    index('receipts_customer_status').on(t.customerId, t.status),
    index('receipts_date').on(t.receiptDate.desc()),
  ],
)

// 登记金额；生效金额按登记顺序现算（04 章第 8 节）。作废收款时同一事务写 revoked_at
export const allocations = pgTable(
  'allocations',
  {
    ...commonColumns(),
    receiptId: bigint({ mode: 'number' })
      .notNull()
      .references(() => receipts.id, { onDelete: 'restrict' }),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountCents: integer().notNull(),
    kind: allocKind().notNull(),
    revokedAt: timestamptz(),
  },
  (t) => [
    check('allocations_amount_positive', sql`${t.amountCents} > 0`),
    index('allocations_order_live')
      .on(t.orderId)
      .where(sql`${t.revokedAt} IS NULL`),
    index('allocations_receipt_live')
      .on(t.receiptId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
)
