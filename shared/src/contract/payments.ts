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
    docType: z.enum(['po', 'wh']),
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
  value: {
    allocs: { docType: 'po' | 'wh'; docId: string; amountCents: number }[]
    expected: { docType: 'po' | 'wh'; docId: string; unpaidCents: number }[]
  },
  ctx: z.RefinementCtx,
) {
  // 手工入库单只整单付款（2026-10-03 确认）：核销金额等于提交时看到的待付
  value.allocs.forEach((allocation, index) => {
    if (allocation.docType !== 'wh') return
    const seen = value.expected.find(
      (row) => row.docType === 'wh' && row.docId === allocation.docId,
    )
    if (seen && allocation.amountCents !== seen.unpaidCents)
      ctx.addIssue({
        code: 'custom',
        message: copy.stock.stockInPayWhole,
        path: ['allocs', index, 'amountCents'],
      })
  })
  checkDistinct(ctx, {
    items: value.allocs,
    keyOf: (allocation) => `${allocation.docType}:${allocation.docId}`,
    message: copy.stock.duplicatePaymentDoc,
    path: ['allocs', 'docId'],
  })
  checkDistinct(ctx, {
    items: value.expected,
    keyOf: (item) => `${item.docType}:${item.docId}`,
    message: copy.stock.duplicatePaymentDoc,
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
