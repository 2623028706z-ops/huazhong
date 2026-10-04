import * as z from 'zod'
import { statementCopy } from '../copy-statements.ts'
import { financeCopy } from '../copy-finance.ts'
import { STORED_INT_MAX, businessDateSchema, idSchema, versionSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'
import { refundSchema } from './ledger.ts'
const shape = {
  refundDate: businessDateSchema,
  amountCents: z.number().int().positive().max(STORED_INT_MAX),
  methodName: z.string().trim().min(1, financeCopy.methodRequired),
  note: z.string().trim(),
}
export const createRefund = {
  method: 'POST',
  path: '/finance/refunds',
  grants: ['finance'],
  body: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('receipt'), customerId: idSchema, ...shape }),
    z.object({ kind: z.literal('payment'), supplierId: idSchema, ...shape }),
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
    reason: z.string().trim().min(1, statementCopy.voidReasonRequired),
  }),
  response: refundSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE', 'FORBIDDEN'],
} as const satisfies Endpoint
