import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { statementKinds, statementStatuses } from '@huazhong/shared'
import { accountRef, commonColumns, timestamptz, versionColumn } from './columns.ts'
import { recordStatus, refundKind } from './enums.ts'
import { customers, suppliers, stores } from './org.ts'
export const statementKind = pgEnum('statement_kind', statementKinds)
export const statementStatus = pgEnum('statement_status', statementStatuses)
const cents = () => bigint({ mode: 'number' }).notNull()
const customerRef = () =>
  bigint({ mode: 'number' }).references(() => customers.id, { onDelete: 'restrict' })
const supplierRef = () =>
  bigint({ mode: 'number' }).references(() => suppliers.id, { onDelete: 'restrict' })
const voidFields = () => ({ voidReason: text(), voidedBy: accountRef(), voidedAt: timestamptz() })
export const paymentMethods = pgTable(
  'payment_methods',
  {
    ...commonColumns(),
    name: text().notNull(),
    enabled: boolean().notNull().default(true),
    sort: integer().notNull().default(0),
  },
  (t) => [unique().on(t.name)],
)
export const statements = pgTable(
  'statements',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    kind: statementKind().notNull(),
    customerId: customerRef(),
    supplierId: supplierRef(),
    periodFrom: date().notNull(),
    periodTo: date().notNull(),
    statementDate: date().notNull(),
    dueDate: date(),
    note: text().notNull().default(''),
    grossCents: cents(),
    openingDebtCents: integer().notNull().default(0),
    creditDeductedCents: cents().default(0),
    dueCents: cents(),
    creditGeneratedCents: cents().default(0),
    status: statementStatus().notNull(),
    settledAt: timestamptz(),
    ...voidFields(),
  },
  (t) => [
    check(
      'statements_party',
      sql`num_nonnulls(${t.customerId},${t.supplierId})=1 AND ((${t.kind}='customer')=(${t.customerId} IS NOT NULL))`,
    ),
    check('statements_period', sql`${t.periodFrom}<=${t.periodTo}`),
    check(
      'statements_amounts',
      sql`${t.openingDebtCents}>=0 AND ${t.creditDeductedCents}>=0 AND ${t.dueCents}>=0 AND ${t.creditGeneratedCents}>=0 AND ${t.dueCents}=greatest(${t.grossCents}+${t.openingDebtCents}-${t.creditDeductedCents},0) AND ${t.creditGeneratedCents}=greatest(-(${t.grossCents}+${t.openingDebtCents}),0) AND ${t.creditDeductedCents}<=greatest(${t.grossCents}+${t.openingDebtCents},0)`,
    ),
    check(
      'statements_state',
      sql`(${t.status}<>'settled' OR ${t.settledAt} IS NOT NULL) AND (${t.status}<>'unsettled' OR ${t.settledAt} IS NULL) AND (${t.status}<>'voided' OR (${t.voidReason} IS NOT NULL AND length(trim(${t.voidReason}))>0 AND ${t.voidedBy} IS NOT NULL AND ${t.voidedAt} IS NOT NULL))`,
    ),
    index('statements_customer').on(t.customerId, t.statementDate.desc(), t.id),
    index('statements_supplier').on(t.supplierId, t.statementDate.desc(), t.id),
    index('statements_waiting').on(t.kind, t.status, t.dueDate),
    uniqueIndex('statements_customer_opening')
      .on(t.customerId)
      .where(sql`${t.openingDebtCents}>0 AND ${t.status}<>'voided'`),
    uniqueIndex('statements_supplier_opening')
      .on(t.supplierId)
      .where(sql`${t.openingDebtCents}>0 AND ${t.status}<>'voided'`),
  ],
)
export const statementLines = pgTable(
  'statement_lines',
  {
    ...commonColumns(),
    statementId: bigint({ mode: 'number' })
      .notNull()
      .references(() => statements.id, { onDelete: 'restrict' }),
    sourceType: text().notNull(),
    sourceId: bigint({ mode: 'number' }).notNull(),
    sourceVersion: integer(),
    parentType: text(),
    parentId: bigint({ mode: 'number' }),
    sourceNo: text().notNull(),
    sourceDate: date().notNull(),
    storeId: bigint({ mode: 'number' }).references(() => stores.id, { onDelete: 'restrict' }),
    storeName: text(),
    amountCents: cents(),
    carriesAmount: boolean().notNull().default(true),
    previousPeriod: boolean().notNull(),
    sort: integer().notNull(),
    releasedAt: timestamptz(),
  },
  (t) => [
    check(
      'statement_lines_source_type',
      sql`${t.sourceType} IN ('order','after','po','wh','purchase_return','price_change')`,
    ),
    unique().on(t.statementId, t.sourceType, t.sourceId),
    uniqueIndex('statement_lines_live_source')
      .on(t.sourceType, t.sourceId)
      .where(sql`${t.releasedAt} IS NULL`),
    index('statement_lines_statement').on(t.statementId),
  ],
)
const fundFields = () => ({
  ...commonColumns(),
  version: versionColumn(),
  no: text().notNull().unique(),
  amountCents: integer().notNull(),
  discountCents: integer().notNull().default(0),
  discountReason: text().notNull().default(''),
  creditCents: cents().default(0),
  methodName: text().notNull(),
  note: text().notNull().default(''),
  status: recordStatus().notNull().default('valid'),
  ...voidFields(),
})
export const receipts = pgTable(
  'receipts',
  { ...fundFields(), receiptDate: date().notNull(), customerId: customerRef().notNull() },
  (t) => [
    check(
      'receipts_amount_positive',
      sql`${t.amountCents}>0 AND ${t.discountCents}>=0 AND ${t.creditCents}>=0 AND ${t.creditCents}<=${t.amountCents}`,
    ),
    check(
      'receipts_void_reason',
      sql`${t.status}<>'voided' OR (${t.voidReason} IS NOT NULL AND length(trim(${t.voidReason}))>0 AND ${t.voidedBy} IS NOT NULL AND ${t.voidedAt} IS NOT NULL)`,
    ),
    index('receipts_customer_status').on(t.customerId, t.status),
    index('receipts_date').on(t.receiptDate.desc()),
  ],
)
export const payments = pgTable(
  'payments',
  { ...fundFields(), payDate: date().notNull(), supplierId: supplierRef().notNull() },
  (t) => [
    check(
      'payments_amount_positive',
      sql`${t.amountCents}>0 AND ${t.discountCents}>=0 AND ${t.creditCents}>=0 AND ${t.creditCents}<=${t.amountCents}`,
    ),
    check(
      'payments_void_reason',
      sql`${t.status}<>'voided' OR (${t.voidReason} IS NOT NULL AND length(trim(${t.voidReason}))>0 AND ${t.voidedBy} IS NOT NULL AND ${t.voidedAt} IS NOT NULL)`,
    ),
    index('payments_supplier_status').on(t.supplierId, t.status),
    index('payments_date').on(t.payDate.desc()),
  ],
)
export const settlementLinks = pgTable(
  'settlement_links',
  {
    ...commonColumns(),
    statementId: bigint({ mode: 'number' })
      .notNull()
      .references(() => statements.id, { onDelete: 'restrict' }),
    receiptId: bigint({ mode: 'number' }).references(() => receipts.id, { onDelete: 'restrict' }),
    paymentId: bigint({ mode: 'number' }).references(() => payments.id, { onDelete: 'restrict' }),
    amountCents: cents(),
    reversedAt: timestamptz(),
  },
  (t) => [
    check('settlement_links_one_fund', sql`num_nonnulls(${t.receiptId},${t.paymentId})=1`),
    check('settlement_links_positive', sql`${t.amountCents}>0`),
    uniqueIndex('settlement_links_live_statement')
      .on(t.statementId)
      .where(sql`${t.reversedAt} IS NULL`),
    index('settlement_links_receipt').on(t.receiptId),
    index('settlement_links_payment').on(t.paymentId),
  ],
)
export const refunds = pgTable(
  'refunds',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    kind: refundKind().notNull(),
    customerId: customerRef(),
    supplierId: supplierRef(),
    refundDate: date().notNull(),
    amountCents: integer().notNull(),
    methodName: text().notNull(),
    note: text().notNull().default(''),
    status: recordStatus().notNull().default('valid'),
    ...voidFields(),
  },
  (t) => [
    check(
      'refunds_one_party',
      sql`num_nonnulls(${t.customerId},${t.supplierId})=1 AND ((${t.kind}='receipt')=(${t.customerId} IS NOT NULL))`,
    ),
    check('refunds_amount_positive', sql`${t.amountCents}>0`),
    check(
      'refunds_void_reason',
      sql`${t.status}<>'voided' OR (${t.voidReason} IS NOT NULL AND length(trim(${t.voidReason}))>0 AND ${t.voidedBy} IS NOT NULL AND ${t.voidedAt} IS NOT NULL)`,
    ),
    index('refunds_customer').on(t.customerId, t.status),
    index('refunds_supplier').on(t.supplierId, t.status),
  ],
)
export const creditUses = pgTable(
  'credit_uses',
  {
    ...commonColumns(),
    sourceReceiptId: bigint({ mode: 'number' }).references(() => receipts.id, {
      onDelete: 'restrict',
    }),
    sourcePaymentId: bigint({ mode: 'number' }).references(() => payments.id, {
      onDelete: 'restrict',
    }),
    sourceStatementId: bigint({ mode: 'number' }).references(() => statements.id, {
      onDelete: 'restrict',
    }),
    statementId: bigint({ mode: 'number' }).references(() => statements.id, {
      onDelete: 'restrict',
    }),
    refundId: bigint({ mode: 'number' }).references(() => refunds.id, { onDelete: 'restrict' }),
    amountCents: cents(),
    releasedAt: timestamptz(),
  },
  (t) => [
    check(
      'credit_uses_source',
      sql`num_nonnulls(${t.sourceReceiptId},${t.sourcePaymentId},${t.sourceStatementId})=1`,
    ),
    check(
      'credit_uses_target',
      sql`num_nonnulls(${t.statementId},${t.refundId})=1 AND (${t.sourceStatementId} IS NULL OR ${t.statementId} IS NULL OR ${t.sourceStatementId} <> ${t.statementId})`,
    ),
    check('credit_uses_amount', sql`${t.amountCents}>0`),
    index('credit_uses_receipt')
      .on(t.sourceReceiptId)
      .where(sql`${t.releasedAt} IS NULL`),
    index('credit_uses_payment')
      .on(t.sourcePaymentId)
      .where(sql`${t.releasedAt} IS NULL`),
    index('credit_uses_statement_source')
      .on(t.sourceStatementId)
      .where(sql`${t.releasedAt} IS NULL`),
    index('credit_uses_statement').on(t.statementId),
    index('credit_uses_refund').on(t.refundId),
  ],
)
