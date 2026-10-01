// 订货目录（05 章第 4 节、06 章 X11）：每个客户一份价目和一套订货分类，销售维护。
// 改了目录价，这个客户待确认订单的单价同时更新，只记日志（03 章第 8.1 节）。
// 目录弹层里可以一起改产品本身的配方（所有客户共用，2026-10-03 确认）
import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  centsInputSchema,
  centsSchema,
  idSchema,
  requiredIdSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { bomInputSchema, bomLineSchema, checkBom } from './products.ts'

// 这个客户的订货分类：门店订货页按它分组
export const catalogCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number().int(),
  // 含停用的目录项；大于 0 时不能删除
  itemCount: z.number().int().nonnegative(),
})
export type CatalogCategory = z.infer<typeof catalogCategorySchema>

export const catalogItemSchema = z.object({
  productId: idSchema,
  name: z.string(),
  unit: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  // 客户产品编码，选填，同一客户内不重复；没填为 ''
  customerCode: z.string(),
  // 产品本身停用
  productEnabled: z.boolean(),
  // 目录里停用为 false
  enabled: z.boolean(),
  listPriceCents: centsSchema,
  version: versionSchema,
  // 产品本身的配方明细和版本号（弹层里改配方时带上）
  productVersion: versionSchema,
  bom: z.array(bomLineSchema),
})
export type CatalogItem = z.infer<typeof catalogItemSchema>

// 分类按 sort，目录项按分类、再按产品
export const catalogSchema = z.object({
  customerId: idSchema,
  customerName: z.string(),
  categories: z.array(catalogCategorySchema),
  items: z.array(catalogItemSchema),
})
export type Catalog = z.infer<typeof catalogSchema>

const customerParamsSchema = z.object({ customerId: idSchema })
const itemParamsSchema = z.object({ customerId: idSchema, productId: idSchema })
const categoryParamsSchema = z.object({ customerId: idSchema, id: idSchema })
const categoryBodySchema = z.object({ name: requiredTextSchema(copy.catalog.categoryNameRequired) })

// 一个目录项：上块「这个客户」，下块配方（改了才传 product，和目录项一起提交）
export const catalogItemSaveSchema = z.object({
  // 新加进目录的没有版本号
  version: versionSchema.optional(),
  categoryId: requiredIdSchema(copy.catalog.catalogCategoryRequired),
  customerCode: z.string().trim(),
  priceCents: centsInputSchema(copy.catalog.listPriceRequired),
  enabled: z.boolean(),
  product: z
    .object({ version: versionSchema, bom: bomInputSchema })
    .superRefine(checkBom)
    .optional(),
})
export type CatalogItemSave = z.infer<typeof catalogItemSaveSchema>

export const getCatalog = {
  method: 'GET',
  path: '/catalog/:customerId',
  grants: ['sales'],
  params: customerParamsSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 新加或修改一个目录项；返回整份目录
export const saveCatalogItem = {
  method: 'PUT',
  path: '/catalog/:customerId/items/:productId',
  grants: ['sales'],
  params: itemParamsSchema,
  body: catalogItemSaveSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const createCatalogCategory = {
  method: 'POST',
  path: '/catalog/:customerId/categories',
  grants: ['sales'],
  params: customerParamsSchema,
  body: categoryBodySchema,
  response: catalogSchema,
  errors: ['NOT_FOUND'],
  idempotent: true,
} as const satisfies Endpoint

export const updateCatalogCategory = {
  method: 'PATCH',
  path: '/catalog/:customerId/categories/:id',
  grants: ['sales'],
  params: categoryParamsSchema,
  body: categoryBodySchema,
  response: catalogSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 这个客户全部分类的新顺序
export const orderCatalogCategories = {
  method: 'PUT',
  path: '/catalog/:customerId/category-order',
  grants: ['sales'],
  params: customerParamsSchema,
  body: z.object({ ids: z.array(idSchema).min(1) }),
  response: catalogSchema,
  errors: ['NOT_FOUND', 'STALE'],
} as const satisfies Endpoint

export const deleteCatalogCategory = {
  method: 'DELETE',
  path: '/catalog/:customerId/categories/:id',
  grants: ['sales'],
  params: categoryParamsSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
