// 产品分类、产品和配方、订货目录（05 章第 4 节主数据、06 章 X9–X11）：销售维护
import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  idSchema,
  positiveIntSchema,
  requiredIdSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDistinct, idParamsSchema, pageSchema } from './page.ts'

export const productCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  sort: z.number().int(),
  // 含停用的产品；大于 0 时不能删除
  productCount: z.number().int().nonnegative(),
})
export type ProductCategory = z.infer<typeof productCategorySchema>

const categoryBodySchema = z.object({ name: requiredTextSchema(copy.catalog.categoryNameRequired) })

export const listProductCategories = {
  method: 'GET',
  path: '/product-categories',
  grants: ['sales'],
  response: pageSchema(productCategorySchema),
  errors: [],
} as const satisfies Endpoint

export const createProductCategory = {
  method: 'POST',
  path: '/product-categories',
  grants: ['sales'],
  body: categoryBodySchema,
  response: productCategorySchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint

export const updateProductCategory = {
  method: 'PATCH',
  path: '/product-categories/:id',
  grants: ['sales'],
  params: idParamsSchema,
  body: categoryBodySchema,
  response: productCategorySchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 全部分类的新顺序（上移就是和上一个交换后整组提交）
export const orderProductCategories = {
  method: 'PUT',
  path: '/product-categories/order',
  grants: ['sales'],
  body: z.object({ ids: z.array(idSchema).min(1) }),
  response: pageSchema(productCategorySchema),
  errors: ['STALE'],
} as const satisfies Endpoint

export const deleteProductCategory = {
  method: 'DELETE',
  path: '/product-categories/:id',
  grants: ['sales'],
  params: idParamsSchema,
  response: z.object({}),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const bomLineSchema = z.object({
  materialId: idSchema,
  materialName: z.string(),
  unit: z.string(),
  qty: z.number().int().positive(),
  materialEnabled: z.boolean(),
})

export const productItemSchema = z.object({
  id: idSchema,
  version: versionSchema,
  name: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  unit: z.string(),
  enabled: z.boolean(),
  imageFileId: idSchema.nullable(),
  imageUrl: z.string().nullable(),
  bom: z.array(bomLineSchema),
})
export type ProductItem = z.infer<typeof productItemSchema>

// 配方明细的输入：至少一种花材（产品表单、订货目录弹层共用）
export const bomInputSchema = z
  .array(z.object({ materialId: idSchema, qty: positiveIntSchema(copy.catalog.bomQtyInvalid) }))
  .min(1, { error: copy.catalog.bomRequired })

const productFieldsShape = {
  name: requiredTextSchema(copy.catalog.productNameRequired),
  categoryId: requiredIdSchema(copy.catalog.categoryRequired),
  unit: requiredTextSchema(copy.catalog.unitRequired),
  imageFileId: idSchema.nullable(),
  enabled: z.boolean(),
  bom: bomInputSchema,
}

// 同一种花材只能出现一次；产品表单和订货目录弹层共用
export function checkBom(value: { bom: { materialId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.bom,
    keyOf: (line) => line.materialId,
    message: copy.catalog.bomDuplicate,
    path: ['bom', 'materialId'],
  })
}

export const productCreateSchema = z.object(productFieldsShape).superRefine(checkBom)
export type ProductCreate = z.infer<typeof productCreateSchema>
export const productUpdateSchema = z
  .object({ version: versionSchema, ...productFieldsShape })
  .superRefine(checkBom)
export type ProductUpdate = z.infer<typeof productUpdateSchema>

export const listProducts = {
  method: 'GET',
  path: '/products',
  grants: ['sales'],
  query: z.object({ categoryId: idSchema.optional() }),
  // 列表级 actions ⊆ create、manageCategories
  response: pageSchema(productItemSchema),
  errors: [],
} as const satisfies Endpoint

export const createProduct = {
  method: 'POST',
  path: '/products',
  grants: ['sales'],
  body: productCreateSchema,
  response: productItemSchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint

export const updateProduct = {
  method: 'PATCH',
  path: '/products/:id',
  grants: ['sales'],
  params: idParamsSchema,
  body: productUpdateSchema,
  response: productItemSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
