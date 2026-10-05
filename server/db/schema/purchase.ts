// 阶段 4 采购、供应商端单据（04 章第 5 节）
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { accountRef, commonColumns, timestamptz, versionColumn } from './columns.ts'
import { inviteStatus, poStatus } from './enums.ts'
import { materials, whDocs } from './warehouse.ts'
import { suppliers } from './org.ts'

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    orderDate: date({ mode: 'string' }).notNull(),
    supplierId: bigint({ mode: 'number' })
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    buyerId: accountRef().notNull(),
    inviteId: bigint({ mode: 'number' }).references((): AnyPgColumn => invites.id, {
      onDelete: 'restrict',
    }),
    status: poStatus().notNull().default('to_receive'),
    note: text().notNull().default(''),
    receivedBy: accountRef(),
    receivedAt: timestamptz(),
    recvNote: text().notNull().default(''),
    cancelReason: text(),
    cancelledBy: accountRef(),
    cancelledAt: timestamptz(),
    voidReason: text(),
    voidedBy: accountRef(),
    voidedAt: timestamptz(),
    // 到货有差异（2026-10-06 第 3 批）：收货少收 / 多收 / 拒收 / 改价、收货后改价、退货、作废已收货的单
    // 记最近一次差异的时间和人；下单采购员（或管理员）点「知道了」记看过。差异时间晚于看过时间 = 没看过，进采购待办
    diffAt: timestamptz(),
    diffBy: accountRef(),
    buyerSeenAt: timestamptz(),
    buyerSeenBy: accountRef(),
  },
  (t) => [
    index('purchase_orders_status_date').on(t.status, t.orderDate.desc()),
    index('purchase_orders_supplier_status').on(t.supplierId, t.status),
    unique('purchase_orders_invite_unique').on(t.inviteId),
    check(
      'purchase_orders_void_reason',
      sql`${t.status}::text <> 'voided' OR (${t.receivedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL)`,
    ),
    check(
      'purchase_orders_received_at',
      sql`${t.status} NOT IN ('received', 'rejected') OR ${t.receivedAt} IS NOT NULL`,
    ),
    check(
      'purchase_orders_cancel_reason',
      sql`${t.status} <> 'cancelled' OR ${t.cancelReason} IS NOT NULL`,
    ),
  ],
)

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    ...commonColumns(),
    poId: bigint({ mode: 'number' })
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    qty: integer().notNull(),
    orderPriceCents: integer().notNull(),
    priceCents: integer().notNull(),
    receivedQty: integer(),
    returnedQty: integer().notNull().default(0),
    sort: integer().notNull(),
  },
  (t) => [
    unique().on(t.poId, t.materialId),
    check('purchase_order_lines_qty_positive', sql`${t.qty} > 0`),
    check(
      'purchase_order_lines_price_nonnegative',
      sql`${t.orderPriceCents} >= 0 AND ${t.priceCents} >= 0`,
    ),
    check(
      'purchase_order_lines_received_nonnegative',
      sql`${t.receivedQty} IS NULL OR ${t.receivedQty} >= 0`,
    ),
    check(
      'purchase_order_lines_returned_range',
      sql`${t.returnedQty} >= 0 AND ${t.returnedQty} <= coalesce(${t.receivedQty}, 0)`,
    ),
  ],
)

export const poChanges = pgTable(
  'po_changes',
  {
    ...commonColumns(),
    poId: bigint({ mode: 'number' })
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    actorLabel: text().notNull(),
    reason: text().notNull(),
    items: jsonb().$type<string[]>().notNull(),
  },
  (t) => [index('po_changes_order_time').on(t.poId, t.createdAt)],
)

export const invites = pgTable(
  'invites',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    inviteDate: date({ mode: 'string' }).notNull(),
    supplierId: bigint({ mode: 'number' })
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    buyerId: accountRef().notNull(),
    status: inviteStatus().notNull().default('pending'),
    submittedAt: timestamptz(),
    cancelledBy: accountRef(),
    cancelledAt: timestamptz(),
    cancelNote: text(),
  },
  (t) => [
    index('invites_status_supplier').on(t.status, t.supplierId),
    check('invites_submitted_at', sql`${t.status} <> 'submitted' OR ${t.submittedAt} IS NOT NULL`),
    check('invites_cancelled_at', sql`${t.status} <> 'cancelled' OR ${t.cancelledAt} IS NOT NULL`),
  ],
)

export const inviteLines = pgTable(
  'invite_lines',
  {
    ...commonColumns(),
    inviteId: bigint({ mode: 'number' })
      .notNull()
      .references(() => invites.id, { onDelete: 'cascade' }),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    needQty: integer().notNull(),
    sort: integer().notNull(),
  },
  (t) => [
    unique().on(t.inviteId, t.materialId),
    check('invite_lines_need_positive', sql`${t.needQty} > 0`),
  ],
)

export const inviteSupplyLines = pgTable(
  'invite_supply_lines',
  {
    ...commonColumns(),
    inviteId: bigint({ mode: 'number' })
      .notNull()
      .references(() => invites.id, { onDelete: 'cascade' }),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    qty: integer().notNull(),
    priceCents: integer().notNull(),
    sort: integer().notNull(),
  },
  (t) => [
    unique().on(t.inviteId, t.materialId),
    check('invite_supply_lines_qty_positive', sql`${t.qty} > 0`),
    check('invite_supply_lines_price_nonnegative', sql`${t.priceCents} >= 0`),
  ],
)

export const priceChanges = pgTable(
  'price_changes',
  {
    ...commonColumns(),
    poId: bigint({ mode: 'number' }).references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    whDocId: bigint({ mode: 'number' }).references(() => whDocs.id, { onDelete: 'restrict' }),
    actorLabel: text().notNull(),
    reason: text().notNull(),
    items: jsonb()
      .$type<{ name: string; fromCents: number; toCents: number; qty: number }[]>()
      .notNull(),
  },
  (t) => [
    index('price_changes_po_time').on(t.poId, t.createdAt),
    index('price_changes_wh_time').on(t.whDocId, t.createdAt),
    check('price_changes_doc', sql`num_nonnulls(${t.poId}, ${t.whDocId}) = 1`),
  ],
)

export const purchaseReturns = pgTable(
  'purchase_returns',
  {
    ...commonColumns(),
    poId: bigint({ mode: 'number' })
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    actorLabel: text().notNull(),
  },
  (t) => [index('purchase_returns_po_time').on(t.poId, t.createdAt)],
)

export const purchaseReturnLines = pgTable(
  'purchase_return_lines',
  {
    ...commonColumns(),
    returnId: bigint({ mode: 'number' })
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: 'cascade' }),
    poLineId: bigint({ mode: 'number' })
      .notNull()
      .references(() => purchaseOrderLines.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    qty: integer().notNull(),
    priceCents: integer().notNull().default(0),
  },
  (t) => [check('purchase_return_lines_qty_positive', sql`${t.qty} > 0`)],
)
