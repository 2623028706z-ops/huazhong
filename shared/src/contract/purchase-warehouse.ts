import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  centsInputSchema,
  idSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { checkDistinct, idParamsSchema } from './page.ts'
import { poDetailSchema } from './purchase.ts'

function distinctLines(value: { lines: { poLineId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.lines,
    keyOf: (line) => line.poLineId,
    message: copy.finance.materialDuplicate,
    path: ['lines', 'poLineId'],
  })
}
export const receivePurchaseOrder = {
  method: 'POST',
  path: '/purchase-orders/:id/receive',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z
    .object({
      version: versionSchema,
      recvNote: z.string().trim(),
      reason: z.string().trim().optional(),
      lines: z
        .array(
          z.object({
            poLineId: idSchema,
            receivedQty: nonNegativeIntSchema(copy.finance.receiveQtyInvalid),
            priceCents: centsInputSchema(copy.finance.poPriceRequired),
          }),
        )
        .min(1, copy.finance.poLinesRequired),
    })
    .superRefine(distinctLines),
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const returnPurchaseOrder = {
  method: 'POST',
  path: '/purchase-orders/:id/returns',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z
    .object({
      version: versionSchema,
      lines: z
        .array(
          z.object({
            poLineId: idSchema,
            qty: positiveIntSchema(copy.finance.returnQtyInvalid),
          }),
        )
        .min(1, copy.finance.returnQtyInvalid),
    })
    .superRefine(distinctLines),
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const repricePurchaseOrder = {
  method: 'POST',
  path: '/purchase-orders/:id/reprice',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z
    .object({
      version: versionSchema,
      reason: requiredTextSchema(copy.finance.repriceReason),
      lines: z
        .array(
          z.object({
            poLineId: idSchema,
            priceCents: centsInputSchema(copy.finance.poPriceRequired),
          }),
        )
        .min(1, copy.finance.poLinesRequired),
    })
    .superRefine(distinctLines),
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
