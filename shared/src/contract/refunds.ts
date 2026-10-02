import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  idSchema,
  positiveIntSchema,
  requiredDateSchema,
  requiredTextSchema,
  versionSchema,
} from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'
import { refundSchema } from './ledger.ts'
import { receiptDetailSchema } from './receipts.ts'
import { paymentSchema } from './payments.ts'

const refundShape = {
  refundDate: requiredDateSchema(copy.rework.refundDateRequired),
  amountCents: positiveIntSchema(copy.finance.amountRequired),
  methodName: requiredTextSchema(copy.finance.methodRequired),
  note: z.string().trim(),
}
export const createRefund = {
  method: 'POST',
  path: '/finance/refunds',
  grants: ['finance'],
  body: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('receipt'),
      receiptId: idSchema,
      paymentId: z.never().optional(),
      ...refundShape,
    }),
    z.object({
      kind: z.literal('payment'),
      paymentId: idSchema,
      receiptId: z.never().optional(),
      ...refundShape,
    }),
  ]),
  response: refundSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const voidRefund = {
  method: 'POST',
  path: '/finance/refunds/:id/void',
  grants: ['finance'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.finance.voidReasonRequired),
  }),
  response: refundSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
const revokeBody = z.object({ reason: requiredTextSchema(copy.rework.revokeReasonRequired) })
export const revokeAllocation = {
  method: 'POST',
  path: '/finance/allocations/:id/revoke',
  grants: ['finance'],
  params: idParamsSchema,
  body: revokeBody,
  response: receiptDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const revokePaymentAllocation = {
  method: 'POST',
  path: '/finance/payment-allocations/:id/revoke',
  grants: ['finance'],
  params: idParamsSchema,
  body: revokeBody,
  response: paymentSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
