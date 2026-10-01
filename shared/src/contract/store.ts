// 门店端（05 章第 5 节，06 章 S0–S9）：门店账号只读写本店。
// 订单、售后的列表和详情复用 orders.ts、afters.ts（按本店过滤）；申请售后在 afters.ts
import * as z from 'zod'
import { copy } from '../copy.ts'
import { centsSchema, idSchema, positiveIntSchema, versionSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { arCardSchema } from './finance.ts'
import { checkProductLines } from './order-writes.ts'
import { orderDetailSchema } from './orders.ts'
import {
  checkDateRange,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'

export const storeHomeSchema = z.object({
  // 订阅 catalog、ar 用
  customerId: idSchema,
  // 本客户启用的目录项数（产品本身也须启用），和订货目录的可订款数同一口径
  orderableCount: z.number().int().nonnegative(),
  // 客户停用时的一句提示，否则 null
  lockedReason: z.string().nullable(),
})
export type StoreHome = z.infer<typeof storeHomeSchema>

export const storeHome = {
  method: 'GET',
  path: '/store/home',
  grants: ['store'],
  response: storeHomeSchema,
  errors: [],
} as const satisfies Endpoint

export const storeCatalogItemSchema = z.object({
  productId: idSchema,
  name: z.string(),
  unit: z.string(),
  categoryId: idSchema,
  listPriceCents: centsSchema,
  thumbUrl: z.string().nullable(),
})
export type StoreCatalogItem = z.infer<typeof storeCatalogItemSchema>

// 全部可订产品一次给全（购物车要核对停订）；分类、搜索在页面里筛
export const storeCatalogSchema = z.object({
  categories: z.array(z.object({ id: idSchema, name: z.string() })),
  items: z.array(storeCatalogItemSchema),
})
export type StoreCatalog = z.infer<typeof storeCatalogSchema>

export const storeCatalog = {
  method: 'GET',
  path: '/store/catalog',
  grants: ['store'],
  response: storeCatalogSchema,
  errors: ['BUSINESS_RULE'],
} as const satisfies Endpoint

// 门店不传单价（取目录价），也不传出货日期（销售确认时定，阶段 3 确认）
const storeLinesSchema = z
  .array(z.object({ productId: idSchema, qty: positiveIntSchema(copy.order.qtyInvalid) }))
  .min(1, { error: copy.order.storeLinesRequired })

export const storeOrderCreateSchema = z
  .object({ note: z.string().trim(), lines: storeLinesSchema })
  .superRefine(checkProductLines)
export type StoreOrderCreate = z.infer<typeof storeOrderCreateSchema>

export const storeOrderUpdateSchema = z
  .object({ version: versionSchema, note: z.string().trim(), lines: storeLinesSchema })
  .superRefine(checkProductLines)
export type StoreOrderUpdate = z.infer<typeof storeOrderUpdateSchema>

export const createStoreOrder = {
  method: 'POST',
  path: '/store/orders',
  grants: ['store'],
  body: storeOrderCreateSchema,
  response: orderDetailSchema,
  errors: ['BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

export const updateStoreOrder = {
  method: 'PUT',
  path: '/store/orders/:id',
  grants: ['store'],
  params: idParamsSchema,
  body: storeOrderUpdateSchema,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const cancelStoreOrder = {
  method: 'POST',
  path: '/store/orders/:id/cancel',
  grants: ['store'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE'],
} as const satisfies Endpoint

// 门店对账：只看本店发货单，不显示预收；按出货日期筛（默认全部）
export const storeStatement = {
  method: 'GET',
  path: '/store/statement',
  grants: ['store'],
  query: pageQuerySchema.extend(dateRangeShape).superRefine(checkDateRange),
  response: pageSchema(arCardSchema).extend({
    shippedCents: centsSchema,
    afterCents: centsSchema,
    paidCents: centsSchema,
    unpaidCents: centsSchema,
  }),
  errors: [],
} as const satisfies Endpoint
