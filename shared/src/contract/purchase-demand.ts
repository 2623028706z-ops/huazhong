import * as z from 'zod'
import { businessDateSchema, idSchema } from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDateRange, dateRangeShape } from './page.ts'

export const demandQuerySchema = z
  .object({ ...dateRangeShape, shortageOnly: z.stringbool().optional() })
  .superRefine(checkDateRange)
const inviteSourceSchema = z.object({
  supplierId: idSchema,
  inviteId: idSchema,
  no: z.string(),
  supplierName: z.string(),
  needQty: z.number().int().positive(),
})
export const listPurchaseDemand = {
  method: 'GET',
  path: '/purchase/demand',
  grants: ['purchase'],
  query: demandQuerySchema,
  response: z.object({
    from: businessDateSchema,
    to: businessDateSchema,
    orderCount: z.number().int().nonnegative(),
    overdue: z.object({
      count: z.number().int().nonnegative(),
      shipFrom: businessDateSchema.nullable(),
      shipTo: businessDateSchema.nullable(),
    }),
    mats: z.array(
      z.object({
        materialId: idSchema,
        code: z.string(),
        shipFrom: businessDateSchema,
        shipTo: businessDateSchema,
        name: z.string(),
        unit: z.string(),
        enabled: z.boolean(),
        needQty: z.number().int().nonnegative(),
        stockQty: z.number().int().nonnegative(),
        inTransitQty: z.number().int().nonnegative(),
        leftQty: z.number().int(),
        invited: z.boolean(),
        invites: z.array(inviteSourceSchema),
      }),
    ),
    actions: z.array(actionSchema),
  }),
  errors: [],
} as const satisfies Endpoint
export const listDemandSources = {
  method: 'GET',
  path: '/purchase/demand/:materialId/sources',
  grants: ['purchase'],
  params: z.object({ materialId: idSchema }),
  query: demandQuerySchema,
  response: z.object({
    materialId: idSchema,
    inTransitQty: z.number().int().nonnegative(),
    inTransitSources: z.array(
      z.object({
        poId: idSchema,
        no: z.string(),
        supplierId: idSchema,
        supplierName: z.string(),
        qty: z.number().int().positive(),
        status: z.literal('to_receive'),
      }),
    ),
    invites: z.array(inviteSourceSchema),
    groups: z.array(
      z.object({
        shipDate: businessDateSchema,
        items: z.array(
          z.object({
            orderId: idSchema,
            orderNo: z.string(),
            customerName: z.string(),
            storeName: z.string(),
            productName: z.string(),
            qty: z.number().int().positive(),
            productUnit: z.string(),
            bomQty: z.number().int().positive(),
            materialQty: z.number().int().positive(),
          }),
        ),
      }),
    ),
  }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
