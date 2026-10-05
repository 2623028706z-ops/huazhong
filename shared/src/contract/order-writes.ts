// 订单写接口（05 章第 4、6 节）：销售新建、确认（定出货日期）、修改、取消；发货确认发货
import * as z from 'zod'
import { copy } from '../copy.ts'
import { redesignCopy } from '../copy-redesign.ts'
import { ORDER_BATCH_MAX_COUNT } from '../config.ts'
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
import { orderDetailSchema, shippingDetailSchema } from './orders.ts'

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

// 修改待发货订单；待确认统一通过 confirmOrder 的可编辑确认页。修改原因选填（03 章：只有作废、取消必填）
export const orderUpdateSchema = z
  .object({
    version: versionSchema,
    shipDate: shipDateSchema,
    note: z.string().trim(),
    reason: z.string().trim().default(''),
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
  body: z
    .object({
      version: versionSchema,
      shipDate: shipDateSchema,
      note: z.string().trim().optional(),
      reason: z.string().trim().optional(),
      lines: salesLinesSchema.optional(),
    })
    .superRefine((value, ctx) => {
      if (value.lines) checkProductLines({ lines: value.lines }, ctx)
    }),
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
  response: shippingDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
const versionBody = z.object({ version: versionSchema })
export const requestOrderCancel = {
  method: 'POST',
  path: '/store/orders/:id/cancel-request',
  grants: ['store'],
  params: idParamsSchema,
  body: versionBody.extend({ reason: z.string().trim().default('') }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const withdrawOrderCancel = {
  method: 'POST',
  path: '/store/orders/:id/cancel-request/withdraw',
  grants: ['store'],
  params: idParamsSchema,
  body: versionBody,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const approveOrderCancel = {
  method: 'POST',
  path: '/orders/:id/cancel-request/approve',
  grants: ['sales'],
  params: idParamsSchema,
  body: versionBody,
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const rejectOrderCancel = {
  method: 'POST',
  path: '/orders/:id/cancel-request/reject',
  grants: ['sales'],
  params: idParamsSchema,
  body: versionBody.extend({ reason: z.string().trim().default('') }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const voidOrder = {
  method: 'POST',
  path: '/orders/:id/void',
  grants: ['sales'],
  params: idParamsSchema,
  body: versionBody.extend({ reason: requiredTextSchema(copy.rework.voidReasonRequired) }),
  response: orderDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 多单逐单事务，明细不可在批量里修改；失败单不回滚已成功的单。
const batchOrdersSchema = z
  .array(z.object({ id: idSchema, version: versionSchema }))
  .min(1)
  .max(ORDER_BATCH_MAX_COUNT)
  .superRefine((orders, ctx) => {
    const seen = new Set<string>()
    orders.forEach((order, index) => {
      if (seen.has(order.id))
        ctx.addIssue({
          code: 'custom',
          message: redesignCopy.duplicateOrder,
          path: [index, 'id'],
        })
      seen.add(order.id)
    })
  })
// 逐单结果（2026-10-06 第 3 批）：带客户、门店给结果弹层「客户 · 门店 / 单号」；失败的带原因
const batchItemShape = {
  id: idSchema,
  no: z.string(),
  customerName: z.string(),
  storeName: z.string(),
}
const batchResultSchema = z.object({
  succeeded: z.array(z.object(batchItemShape)),
  failed: z.array(z.object({ ...batchItemShape, reason: z.string() })),
})
export const batchConfirmOrders = {
  method: 'POST',
  path: '/orders/batch-confirm',
  grants: ['sales'],
  body: z.object({ orders: batchOrdersSchema, shipDate: shipDateSchema }),
  response: batchResultSchema,
  errors: [],
} as const satisfies Endpoint
export const batchShipOrders = {
  method: 'POST',
  path: '/orders/batch-ship',
  grants: ['shipping'],
  body: z.object({ orders: batchOrdersSchema }),
  response: batchResultSchema,
  errors: [],
} as const satisfies Endpoint
