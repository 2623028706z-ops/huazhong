import * as z from 'zod'
import { copy } from '../copy.ts'
import { recordStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  positiveIntSchema,
  requiredDateSchema,
  requiredTextSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'
import { checkDistinct } from './page.ts'
import {
  actorSchema,
  ledgerTokenSchema,
  paymentAllocationSchema,
  paymentExpectedSchema,
  refundSchema,
} from './ledger.ts'

export const paymentSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  supplierId: idSchema,
  supplierName: z.string(),
  payDate: businessDateSchema,
  amountCents: centsSchema,
  prepaidCents: centsSchema,
  allocations: z.array(paymentAllocationSchema),
  refunds: z.array(refundSchema),
  notice: z.string().nullable(),
  methodName: z.string(),
  note: z.string().nullable(),
  status: z.enum(recordStatuses),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  voidedBy: actorSchema.nullable(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type PaymentDetail = z.infer<typeof paymentSchema>
export const paymentAllocsSchema = z.array(
  z.object({
    docType: z.literal('po'),
    docId: idSchema,
    amountCents: positiveIntSchema(copy.finance.allocRequired),
  }),
)
const snapshotShape = {
  supplierId: idSchema,
  ledgerToken: ledgerTokenSchema,
  expected: z.array(paymentExpectedSchema),
  allocs: paymentAllocsSchema,
}
function checkAllocs(
  value: { allocs: { docId: string }[]; expected: { docId: string }[] },
  ctx: z.RefinementCtx,
) {
  checkDistinct(ctx, {
    items: value.allocs,
    keyOf: (allocation) => allocation.docId,
    message: copy.finance.duplicateOrder,
    path: ['allocs', 'docId'],
  })
  checkDistinct(ctx, {
    items: value.expected,
    keyOf: (item) => item.docId,
    message: copy.finance.duplicateOrder,
    path: ['expected', 'docId'],
  })
}
export const paymentCreateSchema = z
  .object({
    ...snapshotShape,
    amountCents: positiveIntSchema(copy.finance.amountRequired),
    payDate: requiredDateSchema(copy.finance.payDateRequired),
    methodName: requiredTextSchema(copy.finance.paymentMethodRequired),
    note: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    checkAllocs(value, ctx)
    if (
      value.allocs.reduce((total, allocation) => total + allocation.amountCents, 0) >
      value.amountCents
    )
      ctx.addIssue({ code: 'custom', message: copy.finance.allocTotalOver, path: ['allocs'] })
  })
export const createPayment = {
  method: 'POST',
  path: '/finance/payments',
  grants: ['finance'],
  body: paymentCreateSchema,
  response: paymentSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const allocatePaymentPrepaid = {
  method: 'POST',
  path: '/finance/prepaid-payment-allocations',
  grants: ['finance'],
  body: z.object({ ...snapshotShape, allocs: paymentAllocsSchema.min(1) }).superRefine(checkAllocs),
  response: z.object({ supplierId: idSchema, prepaidCents: centsSchema }),
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
