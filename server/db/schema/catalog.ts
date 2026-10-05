// 订货分类、产品（即订货目录）、配方、门店邀请（04 章第 4.1、4.8 节）
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { accountRef, commonColumns, timestamptz, versionColumn } from './columns.ts'
import { storeInviteStatus } from './enums.ts'
import { files } from './files.ts'
import { customers, stores } from './org.ts'
import { materials } from './warehouse.ts'

// 订货分类：每个客户一套，门店订货页按它分组；分类下有产品（含停用的）时不能删（2026-10-03 确认）
export const catalogCategories = pgTable(
  'catalog_categories',
  {
    ...commonColumns(),
    customerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    sort: integer().notNull().default(0),
  },
  (t) => [unique('catalog_categories_name_unique').on(t.customerId, t.name)],
)

// 产品即订货目录（2026-10-05 确认）：每个产品属于一个客户，名称、单位、产品图、配方、订货价、
// 订货分类、客户产品编码、可订都只属于这个客户。enabled=false 即停用。分类必须是同一客户的（服务层校验）；
// 客户产品编码选填（'' 为没填），同一客户内不重复
export const products = pgTable(
  'products',
  {
    ...commonColumns(),
    version: versionColumn(),
    customerId: bigint({ mode: 'number' })
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    categoryId: bigint({ mode: 'number' })
      .notNull()
      .references(() => catalogCategories.id, { onDelete: 'restrict' }),
    unit: text().notNull(),
    imageFileId: bigint({ mode: 'number' }).references(() => files.id, { onDelete: 'restrict' }),
    customerCode: text().notNull().default(''),
    priceCents: integer().notNull(),
    enabled: boolean().notNull().default(true),
  },
  (t) => [
    unique('products_customer_name_unique').on(t.customerId, t.name),
    uniqueIndex('products_customer_code_unique')
      .on(t.customerId, t.customerCode)
      .where(sql`${t.customerCode} <> ''`),
    index('products_category_idx').on(t.categoryId),
    check('products_price_nonnegative', sql`${t.priceCents} >= 0`),
  ],
)

// 配方：每个产品至少一行（服务层）
export const productBomLines = pgTable(
  'product_bom_lines',
  {
    ...commonColumns(),
    productId: bigint({ mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    qty: integer().notNull(),
  },
  (t) => [
    unique().on(t.productId, t.materialId),
    check('product_bom_lines_qty_positive', sql`${t.qty} > 0`),
  ],
)

// 同一门店同一时间只有一条待使用；库里只存 token 的 SHA-256
export const storeInvites = pgTable(
  'store_invites',
  {
    ...commonColumns(),
    storeId: bigint({ mode: 'number' })
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    tokenHash: text().notNull().unique(),
    expiresAt: timestamptz().notNull(),
    status: storeInviteStatus().notNull().default('pending'),
    boundAccountId: accountRef(),
    boundAt: timestamptz(),
  },
  (t) => [
    check('store_invites_used_bound', sql`(${t.status} = 'used') = (${t.boundAt} IS NOT NULL)`),
    index('store_invites_store_time').on(t.storeId, t.createdAt.desc()),
    uniqueIndex('store_invites_one_pending')
      .on(t.storeId)
      .where(sql`${t.status} = 'pending'`),
  ],
)
