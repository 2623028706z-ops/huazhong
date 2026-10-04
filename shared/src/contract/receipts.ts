import * as z from 'zod'
import { statementCopy } from '../copy-statements.ts'
import { businessDateSchema, idSchema, versionSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { fundDetailShape, fundInputShape, checkFundInput } from './ledger.ts'
import {
  checkDateRange,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  countedPageSchema,
} from './page.ts'
import { paymentSchema } from './payments.ts'
export const receiptCreateSchema = z
  .object({ customerId: idSchema, receiptDate: businessDateSchema, ...fundInputShape })
  .superRefine(checkFundInput)
export type ReceiptCreate = z.infer<typeof receiptCreateSchema>
export const receiptDetailSchema = z.object({
  ...fundDetailShape,
  customerId: idSchema,
  customerName: z.string(),
  receiptDate: businessDateSchema,
})
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>
export const createReceipt = {
  method: 'POST',
  path: '/finance/receipts',
  grants: ['finance'],
  body: receiptCreateSchema,
  response: receiptDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const getReceipt = {
  method: 'GET',
  path: '/finance/receipts/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: receiptDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const voidReceipt = {
  method: 'POST',
  path: '/finance/receipts/:id/void',
  grants: ['finance'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: z.string().trim().min(1, statementCopy.voidReasonRequired),
  }),
  response: receiptDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE', 'FORBIDDEN'],
} as const satisfies Endpoint
export const listFinanceRecords = {
  method: 'GET',
  path: '/finance/records',
  grants: ['finance'],
  query: pageQuerySchema
    .extend({
      kind: z.enum(['receipt', 'payment']).default('receipt'),
      q: z.string().trim().optional(),
      partyId: idSchema.optional(),
      status: z.enum(['valid', 'voided']).optional(),
      ...dateRangeShape,
    })
    .superRefine(checkDateRange),
  response: countedPageSchema(z.union([receiptDetailSchema, paymentSchema]), ['valid', 'voided']),
  errors: [],
} as const satisfies Endpoint
