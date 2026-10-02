import * as z from 'zod'
import { copy } from '../copy.ts'
import { idSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { demandContextSchema } from './purchase-input.ts'
import { checkDistinct } from './page.ts'
export const reviewPurchase = {
  method: 'POST',
  path: '/purchase/review',
  grants: ['purchase'],
  body: z
    .object({
      kind: z.enum(['po', 'invite']),
      supplierId: idSchema,
      lines: z.array(z.object({ materialId: idSchema, qty: z.number().int().positive() })).min(1),
      demandContext: demandContextSchema.optional(),
    })
    .superRefine((value, ctx) => {
      checkDistinct(ctx, {
        items: value.lines,
        keyOf: (line) => line.materialId,
        message: copy.rework.materialDuplicate,
        path: ['lines', 'materialId'],
      })
    }),
  response: z.object({
    reviewToken: z.string().min(1),
    currentDemand: z.array(
      z.object({
        materialId: idSchema,
        needQty: z.number().int().nonnegative(),
        stockQty: z.number().int().nonnegative(),
        inTransitQty: z.number().int().nonnegative(),
        leftQty: z.number().int(),
      }),
    ),
    warnings: z.array(
      z.object({
        code: z.enum(['pending_invite', 'gap_changed']),
        materialId: idSchema,
        message: z.string(),
        invites: z.array(
          z.object({
            inviteId: idSchema,
            no: z.string(),
            supplierId: idSchema,
            supplierName: z.string(),
            needQty: z.number().int().positive(),
          }),
        ),
      }),
    ),
  }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
