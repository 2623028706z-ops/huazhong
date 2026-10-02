import * as z from 'zod'
import { copy } from '../copy.ts'
import { recordStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  requiredDateSchema,
  requiredTextSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'

export const paymentSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  docType: z.literal('po'),
  docId: idSchema,
  docNo: z.string(),
  supplierId: idSchema,
  supplierName: z.string(),
  payDate: businessDateSchema,
  amountCents: centsSchema,
  methodName: z.string(),
  note: z.string().nullable(),
  status: z.enum(recordStatuses),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type PaymentDetail = z.infer<typeof paymentSchema>
export const createPayment = {
  method: 'POST',
  path: '/finance/payments',
  grants: ['finance'],
  body: z.object({
    docType: z.literal('po'),
    docId: idSchema,
    amountCents: centsSchema,
    payDate: requiredDateSchema(copy.finance.payDateRequired),
    methodName: requiredTextSchema(copy.finance.paymentMethodRequired),
    note: z.string().trim(),
  }),
  response: paymentSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const getPayment = {
  method: 'GET',
  path: '/finance/payments/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: paymentSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const voidPayment = {
  method: 'POST',
  path: '/finance/payments/:id/void',
  grants: ['finance'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.finance.voidReasonRequired),
  }),
  response: paymentSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
