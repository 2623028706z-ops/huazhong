// 订单、订单明细、变更记录、售后（04 章第 4.2–4.7 节）
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { products } from './catalog.ts'
import { accountRef, commonColumns, timestamptz, versionColumn } from './columns.ts'
import {
  afterOrigin,
  afterReason,
  afterStatus,
  orderOrigin,
  orderStatus,
  cancelRequestStatus,
} from './enums.ts'
import { files } from './files.ts'
import { customers, stores } from './org.ts'

function customerRef() {
  return bigint({ mode: 'number' })
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' })
}

function storeRef() {
  return bigint({ mode: 'number' })
    .notNull()
    .references(() => stores.id, { onDelete: 'restrict' })
}

// 出货日期由销售定：门店下的单待确认时为空（03 章第 8.1 节）
export const orders = pgTable(
  'orders',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    orderDate: date({ mode: 'string' }).notNull(),
    shipDate: date({ mode: 'string' }),
    customerId: customerRef(),
    storeId: storeRef(),
    status: orderStatus().notNull(),
    origin: orderOrigin().notNull(),
    note: text().notNull().default(''),
    confirmedBy: accountRef(),
    confirmedAt: timestamptz(),
    shippedBy: accountRef(),
    shippedAt: timestamptz(),
    shipNote: text().notNull().default(''),
    cancelledBy: accountRef(),
    cancelledAt: timestamptz(),
    cancelReason: text(),
    voidReason: text(),
    voidedBy: accountRef(),
    voidedAt: timestamptz(),
  },
  (t) => [
    check('orders_shipped_at', sql`${t.status} <> 'shipped' OR ${t.shippedAt} IS NOT NULL`),
    check(
      'orders_pending_no_ship_date',
      sql`${t.status} <> 'pending_confirm' OR ${t.shipDate} IS NULL`,
    ),
    check(
      'orders_ship_date_set',
      sql`${t.status}::text NOT IN ('to_ship', 'shipped', 'voided') OR ${t.shipDate} IS NOT NULL`,
    ),
    check(
      'orders_void_reason',
      sql`${t.status}::text <> 'voided' OR (${t.shippedAt} IS NOT NULL AND ${t.voidReason} IS NOT NULL)`,
    ),
    index('orders_status_ship_date').on(t.status, t.shipDate),
    index('orders_store_date').on(t.storeId, t.orderDate.desc()),
    index('orders_customer_status').on(t.customerId, t.status),
  ],
)

// 改单时整组替换；已发货的不能再改（售后明细挂在这些行上）
export const orderLines = pgTable(
  'order_lines',
  {
    ...commonColumns(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: bigint({ mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    // 下单时的客户产品编码快照（2026-10-03 确认），没填为 ''
    customerCode: text().notNull().default(''),
    qty: integer().notNull(),
    priceCents: integer().notNull(),
    listPriceCents: integer().notNull(),
    shippedQty: integer(),
    sort: integer().notNull(),
  },
  (t) => [
    unique().on(t.orderId, t.productId),
    check('order_lines_qty_positive', sql`${t.qty} > 0`),
    check('order_lines_price_nonnegative', sql`${t.priceCents} >= 0 AND ${t.listPriceCents} >= 0`),
    check('order_lines_shipped_range', sql`${t.shippedQty} IS NULL OR ${t.shippedQty} >= 0`),
  ],
)

// items 是给人看的字符串数组；内容没变不写
export const orderCancelRequests = pgTable(
  'order_cancel_requests',
  {
    ...commonColumns(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    status: cancelRequestStatus().notNull().default('pending'),
    reason: text().notNull().default(''),
    requestedBy: accountRef().notNull(),
    requestedAt: timestamptz().notNull(),
    handledBy: accountRef(),
    handledAt: timestamptz(),
    rejectReason: text(),
  },
  (table) => [
    uniqueIndex('order_cancel_requests_pending')
      .on(table.orderId)
      .where(sql`${table.status} = 'pending'`),
    index('order_cancel_requests_status_time').on(table.status, table.requestedAt),
    check(
      'order_cancel_requests_reject_reason',
      sql`${table.status} <> 'rejected' OR ${table.rejectReason} IS NOT NULL`,
    ),
  ],
)

export const orderChanges = pgTable(
  'order_changes',
  {
    ...commonColumns(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    actorLabel: text().notNull(),
    reason: text().notNull().default(''),
    items: jsonb().$type<string[]>().notNull(),
  },
  (t) => [index('order_changes_order_time').on(t.orderId, t.createdAt)],
)

export const afters = pgTable(
  'afters',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    afterDate: date({ mode: 'string' }).notNull(),
    orderId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    customerId: customerRef(),
    storeId: storeRef(),
    status: afterStatus().notNull(),
    origin: afterOrigin().notNull(),
    amountCents: integer(),
    note: text().notNull().default(''),
    processedBy: accountRef(),
    processedAt: timestamptz(),
    closeReason: text(),
    voidReason: text(),
    voidedBy: accountRef(),
    voidedAt: timestamptz(),
  },
  (t) => [
    check('afters_amount_nonnegative', sql`${t.amountCents} IS NULL OR ${t.amountCents} >= 0`),
    check(
      'afters_processed_amount',
      sql`${t.status} <> 'processed' OR ${t.amountCents} IS NOT NULL`,
    ),
    check('afters_void_reason', sql`${t.status} <> 'voided' OR ${t.voidReason} IS NOT NULL`),
    index('afters_order_status').on(t.orderId, t.status),
    index('afters_store_date').on(t.storeId, t.afterDate.desc()),
    index('afters_status_date').on(t.status, t.afterDate.desc()),
  ],
)

export const afterLines = pgTable(
  'after_lines',
  {
    ...commonColumns(),
    afterId: bigint({ mode: 'number' })
      .notNull()
      .references(() => afters.id, { onDelete: 'cascade' }),
    orderLineId: bigint({ mode: 'number' })
      .notNull()
      .references(() => orderLines.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    // 门店原始申请数量；销售新建的为空
    requestedQty: integer(),
    qty: integer().notNull(),
    priceCents: integer().notNull(),
    reason: afterReason().notNull(),
    description: text().notNull().default(''),
    sort: integer().notNull(),
  },
  (t) => [
    unique().on(t.afterId, t.orderLineId),
    check(
      'after_lines_requested_positive',
      sql`${t.requestedQty} IS NULL OR ${t.requestedQty} > 0`,
    ),
    check('after_lines_qty_nonnegative', sql`${t.qty} >= 0`),
    check('after_lines_price_nonnegative', sql`${t.priceCents} >= 0`),
  ],
)

export const afterLineImages = pgTable(
  'after_line_images',
  {
    ...commonColumns(),
    afterLineId: bigint({ mode: 'number' })
      .notNull()
      .references(() => afterLines.id, { onDelete: 'cascade' }),
    fileId: bigint({ mode: 'number' })
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    sort: smallint().notNull(),
  },
  (t) => [unique().on(t.afterLineId, t.fileId)],
)
