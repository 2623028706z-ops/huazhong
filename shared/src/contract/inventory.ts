// 库存查询和花材分类（05 章第 3、9 节）：所有员工只读
import * as z from 'zod'
import { idSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { pageQuerySchema, pageSchema } from './page.ts'

export const inventoryQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().optional(),
  categoryId: idSchema.optional(),
})

export const inventoryItemSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  unit: z.string(),
  enabled: z.boolean(),
  stockQty: z.number().int().nonnegative(),
})
export type InventoryItem = z.infer<typeof inventoryItemSchema>

export const materialCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number().int(),
})
export type MaterialCategory = z.infer<typeof materialCategorySchema>
// 分类列表多带启用花材数：新建盘点选分类时每行写「n 种花材」（06 章 W1）
export const materialCategoryRowSchema = materialCategorySchema.extend({
  materialCount: z.number().int().nonnegative(),
})
export type MaterialCategoryRow = z.infer<typeof materialCategoryRowSchema>

// 列表级 actions：能管理花材的（仓库、采购、管理员）给 create（新建花材）、manageCategories（管理分类）
export const listInventory = {
  method: 'GET',
  path: '/inventory',
  grants: ['staff'],
  query: inventoryQuerySchema,
  response: pageSchema(inventoryItemSchema),
  errors: [],
} as const satisfies Endpoint

// 写入（新增、改名）在阶段 4 加，只给仓库
export const listMaterialCategories = {
  method: 'GET',
  path: '/material-categories',
  grants: ['staff'],
  response: pageSchema(materialCategoryRowSchema),
  errors: [],
} as const satisfies Endpoint
