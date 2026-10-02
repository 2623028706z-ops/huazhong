// 花材分类、花材、库存批次（04 章第 6.1、6.2 节）。阶段 2 为库存查询提前建（08 章），
// 批次的来源单据列（source_type、source_id）在阶段 4、5 有了入库单据再加
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
import { moveType, whDocKind, whDocStatus } from './enums.ts'
import { suppliers } from './org.ts'
import { files } from './files.ts'

export const outCategories = pgTable('out_categories', {
  ...commonColumns(),
  name: text().notNull().unique(),
  sort: integer().notNull().default(0),
})
export const whDocs = pgTable(
  'wh_docs',
  {
    ...commonColumns(),
    version: versionColumn(),
    no: text().notNull().unique(),
    kind: whDocKind().notNull(),
    docDate: date({ mode: 'string' }).notNull(),
    status: whDocStatus().notNull(),
    supplierId: bigint({ mode: 'number' }).references(() => suppliers.id, { onDelete: 'restrict' }),
    outCategoryId: bigint({ mode: 'number' }).references(() => outCategories.id, {
      onDelete: 'restrict',
    }),
    reason: text().notNull().default(''),
    voidReason: text(),
    voidedBy: accountRef(),
    voidedAt: timestamptz(),
  },
  (table) => [
    check('wh_docs_supplier', sql`(${table.kind} = 'in') = (${table.supplierId} IS NOT NULL)`),
    check('wh_docs_category', sql`(${table.kind} = 'out') = (${table.outCategoryId} IS NOT NULL)`),
    check('wh_docs_loss_reason', sql`${table.kind} <> 'loss' OR ${table.reason} <> ''`),
    check(
      'wh_docs_status',
      sql`(${table.kind} = 'in' AND ${table.status} IN ('stocked_in','voided')) OR (${table.kind} = 'out' AND ${table.status} IN ('stocked_out','voided')) OR (${table.kind} = 'loss' AND ${table.status} IN ('lost','voided'))`,
    ),
    check(
      'wh_docs_void_reason',
      sql`${table.status} <> 'voided' OR ${table.voidReason} IS NOT NULL`,
    ),
    index('wh_docs_kind_date').on(table.kind, table.docDate.desc()),
    index('wh_docs_supplier').on(table.kind, table.supplierId, table.status),
  ],
)
export const whDocImages = pgTable('wh_doc_images', {
  ...commonColumns(),
  docId: bigint({ mode: 'number' })
    .notNull()
    .references(() => whDocs.id, { onDelete: 'cascade' }),
  fileId: bigint({ mode: 'number' })
    .notNull()
    .references(() => files.id, { onDelete: 'restrict' }),
  sort: integer().notNull(),
})

export const materialCategories = pgTable('material_categories', {
  ...commonColumns(),
  name: text().notNull().unique(),
  sort: integer().notNull().default(0),
})
export const whDocLines = pgTable(
  'wh_doc_lines',
  {
    ...commonColumns(),
    docId: bigint({ mode: 'number' })
      .notNull()
      .references(() => whDocs.id, { onDelete: 'cascade' }),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unit: text().notNull(),
    qty: integer().notNull(),
    priceCents: integer(),
    orderPriceCents: integer(),
    sort: integer().notNull(),
  },
  (table) => [
    unique().on(table.docId, table.materialId),
    check('wh_doc_lines_qty_positive', sql`${table.qty} > 0`),
    check(
      'wh_doc_lines_price_nonnegative',
      sql`${table.priceCents} IS NULL OR ${table.priceCents} >= 0`,
    ),
  ],
)

// 名称可以重复，编码不能重复
export const materials = pgTable('materials', {
  ...commonColumns(),
  version: versionColumn(),
  code: text().notNull().unique(),
  name: text().notNull(),
  categoryId: bigint({ mode: 'number' })
    .notNull()
    .references(() => materialCategories.id, { onDelete: 'restrict' }),
  unit: text().notNull(),
  enabled: boolean().notNull().default(true),
})

// 每次入库一个批次；库存 = 剩余合计，先进先出按 (in_date, id)
export const stockBatches = pgTable(
  'stock_batches',
  {
    ...commonColumns(),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    inDate: date({ mode: 'string' }).notNull(),
    sourceType: text().notNull().default('seed'),
    sourceId: bigint({ mode: 'number' }),
    qty: integer().notNull(),
    leftQty: integer().notNull(),
  },
  (t) => [
    check('stock_batches_qty_positive', sql`${t.qty} > 0`),
    check('stock_batches_left_range', sql`${t.leftQty} >= 0 AND ${t.leftQty} <= ${t.qty}`),
    check(
      'stock_batches_source_link',
      sql`(${t.sourceType} = 'seed' AND ${t.sourceId} IS NULL) OR (${t.sourceType} = 'po' AND ${t.sourceId} IS NOT NULL)`,
    ),
    index('stock_batches_fifo')
      .on(t.materialId, t.inDate, t.id)
      .where(sql`${t.leftQty} > 0`),
    index('stock_batches_source').on(t.sourceType, t.sourceId),
  ],
)

export const stockMoves = pgTable(
  'stock_moves',
  {
    ...commonColumns(),
    movedAt: timestamptz().notNull().defaultNow(),
    type: moveType().notNull(),
    materialId: bigint({ mode: 'number' })
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    batchId: bigint({ mode: 'number' })
      .notNull()
      .references(() => stockBatches.id, { onDelete: 'restrict' }),
    qty: integer().notNull(),
    docType: text().notNull(),
    docId: bigint({ mode: 'number' }).notNull(),
    docNo: text().notNull(),
    reason: text().notNull().default(''),
  },
  (t) => [
    index('stock_moves_material_time').on(t.materialId, t.movedAt.desc()),
    index('stock_moves_doc').on(t.docType, t.docId),
    index('stock_moves_type_time').on(t.type, t.movedAt.desc()),
    check(
      'stock_moves_qty_direction',
      sql`(${t.type} IN ('po_in', 'manual_in', 'check_gain', 'out_void', 'loss_void')) = (${t.qty} > 0) AND ${t.qty} <> 0`,
    ),
  ],
)
