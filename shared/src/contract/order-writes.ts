// 订单写接口（05 章第 4、6 节）：销售新建、确认（定出货日期）、修改、取消；发货确认发货
import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  centsInputSchema,
  idSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  requiredDateSchema,
  requiredIdSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDistinct, idParamsSchema } from './page.ts'
import { orderDetailSchema } from './orders.ts'

// 同一张单同一种产品只能一行（04 章第 10 节）
export function checkProductLines(value: { lines: { productId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.lines,
    keyOf: (l) => l.productId,
    message: copy.order.duplicateProduct,
    path: ['lines', 'productId'],
  })
}

const salesLinesSchema = z
  .array(
    z.object({
      productId: idSchema,
      qty: positiveIntSchema(copy.order.qtyInvalid),
      priceCents: centsInputSchema(copy.order.priceRequired),
    }),
  )
  .min(1, { error: copy.order.linesRequired })

const shipDateSchema = requiredDateSchema(copy.order.shipDateRequired)

export const orderCreateSchema = z
  .object({
    customerId: requiredIdSchema(copy.order.storeRequired),
    storeId: requiredIdSchema(copy.order.storeRequired),
    shipDate: shipDateSchema,
    note: z.string().trim(),
    lines: salesLinesSchema,
  })
  .superRefine(checkProductLines)
export type OrderCreate = z.infer<typeof orderCreateSchema>

// 修改订单（待发货）和修改并确认（待确认，保存后待发货）
export const orderUpdateSchema = z
  .object({
    version: versionSchema,
    shipDate: shipDateSchema,
    note: z.string().trim(),
    reason: requiredTextSchema(copy.order.editReasonRequired),
    lines: salesLinesSchema,
  })
  .superRefine(checkProductLines)
export type OrderUpdate = z.infer<typeof orderUpdateSchema>

export const createOrder = {
  method: 'POST',
  path: '/orders',
  grants: ['sales'],
  body: orderCreateSchema,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

export const confirmOrder = {
  method: 'POST',
  path: '/orders/:id/confirm',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema, shipDate: shipDateSchema }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const updateOrder = {
  method: 'PUT',
  path: '/orders/:id',
  grants: ['sales'],
  params: idParamsSchema,
  body: orderUpdateSchema,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 待确认不用原因，待发货要原因（按 actions 的 reasonRequired）
export const cancelOrder = {
  method: 'POST',
  path: '/orders/:id/cancel',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema, reason: z.string().trim().optional() }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const orderShipSchema = z.object({
  version: versionSchema,
  shipNote: z.string().trim(),
  lines: z.array(
    z.object({ orderLineId: idSchema, shippedQty: nonNegativeIntSchema(copy.order.qtyInvalid) }),
  ),
})
export type OrderShip = z.infer<typeof orderShipSchema>

export const shipOrder = {
  method: 'POST',
  path: '/orders/:id/ship',
  grants: ['shipping'],
  params: idParamsSchema,
  body: orderShipSchema,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
