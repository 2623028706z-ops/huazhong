// 花材分类、花材、库存批次（04 章第 6.1、6.2 节）。阶段 2 为库存查询提前建（08 章），
// 批次的来源单据列（source_type、source_id）在阶段 4、5 有了入库单据再加
import { sql } from 'drizzle-orm'
import { bigint, boolean, check, date, index, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { commonColumns, timestamptz, versionColumn } from './columns.ts'
import { moveType } from './enums.ts'

export const materialCategories = pgTable('material_categories', {
  ...commonColumns(),
  name: text().notNull().unique(),
  sort: integer().notNull().default(0),
})

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
      sql`(${t.type} IN ('po_in', 'manual_in', 'check_gain')) = (${t.qty} > 0) AND ${t.qty} <> 0`,
    ),
  ],
)
