// 订货目录（05 章第 4 节、06 章 X11）：每个客户一份价目，销售维护。
// 改了目录价，这个客户待确认订单的单价同时更新，只记日志（03 章第 8.1 节）
import * as z from 'zod'
import { copy } from '../copy.ts'
import { centsInputSchema, centsSchema, idSchema, versionSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDistinct } from './page.ts'

export const catalogItemSchema = z.object({
  productId: idSchema,
  name: z.string(),
  unit: z.string(),
  categoryName: z.string(),
  // 产品本身停用
  productEnabled: z.boolean(),
  // 目录里停订为 false
  enabled: z.boolean(),
  listPriceCents: centsSchema,
  version: versionSchema,
})
export type CatalogItem = z.infer<typeof catalogItemSchema>

export const catalogSchema = z.object({
  customerId: idSchema,
  customerName: z.string(),
  items: z.array(catalogItemSchema),
})
export type Catalog = z.infer<typeof catalogSchema>

const customerParamsSchema = z.object({ customerId: idSchema })

export const catalogSaveSchema = z
  .object({
    items: z.array(
      z.object({
        productId: idSchema,
        priceCents: centsInputSchema(copy.catalog.listPriceRequired),
        enabled: z.boolean(),
        // 新加进目录的没有版本号
        version: versionSchema.optional(),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    checkDistinct(ctx, {
      items: value.items,
      keyOf: (item) => item.productId,
      message: copy.order.duplicateProduct,
      path: ['items', 'productId'],
    })
  })
export type CatalogSave = z.infer<typeof catalogSaveSchema>

export const getCatalog = {
  method: 'GET',
  path: '/catalog/:customerId',
  grants: ['sales'],
  params: customerParamsSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 只改传了的项；没传的不动
export const saveCatalog = {
  method: 'PUT',
  path: '/catalog/:customerId',
  grants: ['sales'],
  params: customerParamsSchema,
  body: catalogSaveSchema,
  response: catalogSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
