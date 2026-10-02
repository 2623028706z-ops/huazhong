// 收款、核销预收、作废收款、收付款记录（05 章第 10 节，06 章 F3、F4、F8）
import * as z from 'zod'
import { copy } from '../copy.ts'
import { recordStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  positiveIntSchema,
  requiredDateSchema,
  requiredIdSchema,
  requiredTextSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import { paymentSchema } from './payments.ts'
import type { Endpoint } from './endpoint.ts'
import { allocationSchema } from './finance.ts'
import {
  checkDateRange,
  checkDistinct,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
} from './page.ts'

const allocsSchema = z.array(
  z.object({ orderId: idSchema, amountCents: positiveIntSchema(copy.finance.allocRequired) }),
)

function checkAllocs(value: { allocs: { orderId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.allocs,
    keyOf: (a) => a.orderId,
    message: copy.finance.duplicateOrder,
    path: ['allocs', 'orderId'],
  })
}

export const receiptCreateSchema = z
  .object({
    customerId: requiredIdSchema(copy.catalog.customerRequired),
    receiptDate: requiredDateSchema(copy.finance.receiptDateRequired),
    amountCents: positiveIntSchema(copy.finance.amountRequired),
    methodName: requiredTextSchema(copy.finance.methodRequired),
    note: z.string().trim(),
    allocs: allocsSchema,
  })
  .superRefine((value, ctx) => {
    checkAllocs(value, ctx)
    const total = value.allocs.reduce((sum, a) => sum + a.amountCents, 0)
    if (total > value.amountCents) {
      ctx.addIssue({ code: 'custom', message: copy.finance.allocTotalOver, path: ['allocs'] })
    }
  })
export type ReceiptCreate = z.infer<typeof receiptCreateSchema>

export const prepaidAllocateSchema = z
  .object({
    customerId: requiredIdSchema(copy.catalog.customerRequired),
    allocs: allocsSchema.min(1, { error: copy.finance.allocRequired }),
  })
  .superRefine(checkAllocs)
export type PrepaidAllocate = z.infer<typeof prepaidAllocateSchema>

export const receiptCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  status: z.enum(recordStatuses),
  receiptDate: businessDateSchema,
  customerId: idSchema,
  customerName: z.string(),
  methodName: z.string(),
  amountCents: centsSchema,
  // 这笔收款还没核销掉的（作废的为 0）
  prepaidCents: centsSchema,
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type ReceiptCard = z.infer<typeof receiptCardSchema>

export const receiptDetailSchema = receiptCardSchema.extend({
  note: z.string().nullable(),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  // 生效的核销（作废后为空）
  allocations: z.array(allocationSchema),
  // 作废后「已作废，核销已撤回。」
  notice: z.string().nullable(),
})
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>

export const createReceipt = {
  method: 'POST',
  path: '/finance/receipts',
  grants: ['finance'],
  body: receiptCreateSchema,
  response: receiptDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

// 按收款时间先后从各笔有效收款的预收里扣
export const allocatePrepaid = {
  method: 'POST',
  path: '/finance/prepaid-allocations',
  grants: ['finance'],
  body: prepaidAllocateSchema,
  response: z.object({ customerId: idSchema, prepaidCents: centsSchema }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
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
    reason: requiredTextSchema(copy.finance.voidReasonRequired),
  }),
  response: receiptDetailSchema,
  errors: ['NOT_FOUND', 'STALE'],
} as const satisfies Endpoint

// 按类型分页：收款默认选中，与阶段 3 的入口一致。
export const listFinanceRecords = {
  method: 'GET',
  path: '/finance/records',
  grants: ['finance'],
  query: pageQuerySchema
    .extend({
      kind: z.enum(['receipt', 'payment']).default('receipt'),
      status: z.enum(recordStatuses).optional(),
      ...dateRangeShape,
    })
    .superRefine(checkDateRange),
  response: countedPageSchema(z.union([receiptCardSchema, paymentSchema]), recordStatuses),
  errors: [],
} as const satisfies Endpoint
