// 订货目录（05 章第 4 节、06 章 X11 / X13 / X14）：每个客户一份目录、一套订货分类，销售维护。
// 产品归客户（2026-10-05 确认）：名称、单位、产品图、配方、订货价、订货分类、客户产品编码、可订都在
// 这个客户的目录里维护，改了只影响这个客户。改了订货价，这个客户待确认订单的单价同时更新，只记日志（03 章第 8.1 节）
import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  centsInputSchema,
  centsSchema,
  idSchema,
  positiveIntSchema,
  requiredIdSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDistinct } from './page.ts'
import { actionSchema } from './actions.ts'

export const bomLineSchema = z.object({
  materialId: idSchema,
  materialName: z.string(),
  unit: z.string(),
  qty: z.number().int().positive(),
  materialEnabled: z.boolean(),
})
export type BomLine = z.infer<typeof bomLineSchema>

// 配方明细的输入：至少一种花材
export const bomInputSchema = z
  .array(z.object({ materialId: idSchema, qty: positiveIntSchema(copy.catalog.bomQtyInvalid) }))
  .min(1, { error: copy.catalog.bomRequired })

// 同一种花材只能出现一次
export function checkBom(value: { bom: { materialId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.bom,
    keyOf: (line) => line.materialId,
    message: copy.catalog.bomDuplicate,
    path: ['bom', 'materialId'],
  })
}

// 这个客户的订货分类：门店订货页按它分组
export const catalogCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number().int(),
  // 含停用的产品；大于 0 时不能删除
  itemCount: z.number().int().nonnegative(),
})
export type CatalogCategory = z.infer<typeof catalogCategorySchema>

export const catalogItemSchema = z.object({
  productId: idSchema,
  version: versionSchema,
  name: z.string(),
  unit: z.string(),
  imageFileId: idSchema.nullable(),
  imageUrl: z.string().nullable(),
  categoryId: idSchema,
  categoryName: z.string(),
  // 客户产品编码，选填，同一客户内不重复；没填为 ''
  customerCode: z.string(),
  // 可订；false 即停用
  enabled: z.boolean(),
  listPriceCents: centsSchema,
  bom: z.array(bomLineSchema),
})
export type CatalogItem = z.infer<typeof catalogItemSchema>

// 分类按 sort，目录项按分类、再按产品
export const catalogSchema = z.object({
  actions: z.array(actionSchema),
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

const catalogItemFieldsShape = {
  name: requiredTextSchema(copy.catalog.productNameRequired),
  unit: requiredTextSchema(copy.catalog.unitRequired),
  imageFileId: idSchema.nullable(),
  categoryId: requiredIdSchema(copy.catalog.catalogCategoryRequired),
  customerCode: z.string().trim(),
  priceCents: centsInputSchema(copy.catalog.listPriceRequired),
  enabled: z.boolean(),
  bom: bomInputSchema,
}
export const catalogItemCreateSchema = z.object(catalogItemFieldsShape).superRefine(checkBom)
export type CatalogItemCreate = z.infer<typeof catalogItemCreateSchema>
export const catalogItemUpdateSchema = z
  .object({ version: versionSchema, ...catalogItemFieldsShape })
  .superRefine(checkBom)
export type CatalogItemUpdate = z.infer<typeof catalogItemUpdateSchema>

// 从其他客户复制：来源客户的产品，和当前客户重名或已停用的不能复制
export const catalogCopySourceSchema = z.object({
  // 有产品的其他客户（不含当前客户）；没有时 items 为空
  sources: z.array(z.object({ customerId: idSchema, customerName: z.string() })),
  fromCustomerId: idSchema.nullable(),
  items: z.array(
    z.object({
      productId: idSchema,
      name: z.string(),
      unit: z.string(),
      categoryName: z.string(),
      listPriceCents: centsSchema,
      bom: z.array(bomLineSchema),
      skipReason: z.enum(['duplicate', 'disabled']).nullable(),
    }),
  ),
  previewToken: z.string().min(1),
})
export type CatalogCopySource = z.infer<typeof catalogCopySourceSchema>

export const getCatalog = {
  method: 'GET',
  path: '/catalog/:customerId',
  grants: ['sales'],
  params: customerParamsSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
// fromCustomerId 不传时用第一个来源客户
export const catalogCopySources = {
  method: 'GET',
  path: '/catalog/:customerId/copy-sources',
  grants: ['sales'],
  params: customerParamsSchema,
  query: z.object({ fromCustomerId: idSchema.optional() }),
  response: catalogCopySourceSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
// 复制勾选的产品：带名称、单位、产品图、配方、订货价，不带客户产品编码；同名订货分类复用，
// 没有同名的放当前客户第一个分类，当前客户没有分类时按来源分类名新建
export const copyCatalog = {
  method: 'POST',
  path: '/catalog/:customerId/copy',
  grants: ['sales'],
  params: customerParamsSchema,
  body: z.object({
    fromCustomerId: idSchema,
    productIds: z.array(idSchema).min(1),
    previewToken: z.string().min(1),
  }),
  response: catalogSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

// 新建一个产品；返回整份目录
export const createCatalogItem = {
  method: 'POST',
  path: '/catalog/:customerId/items',
  grants: ['sales'],
  params: customerParamsSchema,
  body: catalogItemCreateSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

// 修改一个产品；返回整份目录
export const updateCatalogItem = {
  method: 'PATCH',
  path: '/catalog/:customerId/items/:productId',
  grants: ['sales'],
  params: itemParamsSchema,
  body: catalogItemUpdateSchema,
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
