import * as z from 'zod'
import { statementCopy } from '../copy-statements.ts'
import { businessDateSchema, idSchema, versionSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { fundDetailShape, fundInputShape, checkFundInput } from './ledger.ts'
import { idParamsSchema } from './page.ts'
export const paymentCreateSchema = z
  .object({ supplierId: idSchema, payDate: businessDateSchema, ...fundInputShape })
  .superRefine(checkFundInput)
export const paymentSchema = z.object({
  ...fundDetailShape,
  supplierId: idSchema,
  supplierName: z.string(),
  payDate: businessDateSchema,
})
export type PaymentDetail = z.infer<typeof paymentSchema>
export type PaymentCreate = z.infer<typeof paymentCreateSchema>
export const createPayment = {
  method: 'POST',
  path: '/finance/payments',
  grants: ['finance'],
  body: paymentCreateSchema,
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
    reason: z.string().trim().min(1, statementCopy.voidReasonRequired),
  }),
  response: paymentSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE', 'FORBIDDEN'],
} as const satisfies Endpoint
