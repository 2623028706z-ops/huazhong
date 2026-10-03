import * as z from 'zod'
import { apStatuses } from '../enums.ts'
import { businessDateSchema, centsSchema, idSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'
import { poCardSchema, poDetailSchema } from './purchase.ts'
import { whDocCardSchema, whDocDetailSchema } from './stock.ts'
import {
  paymentAllocationSchema,
  ledgerTokenSchema,
  refundSchema,
  externalAllocationSchema,
} from './ledger.ts'

// 应付单据：采购单、手工入库单（阶段 5）。apDate 是收货日期 / 入库日期，对账筛选和核销排序都用它
const apShape = {
  docId: idSchema,
  apDate: businessDateSchema,
  paidCents: centsSchema,
  unpaidCents: centsSchema,
}
const poApCardSchema = poCardSchema.extend({ ...apShape, docType: z.literal('po') })
const whApCardSchema = whDocCardSchema.extend({
  ...apShape,
  docType: z.literal('wh'),
  amountCents: centsSchema,
  payableCents: centsSchema,
  apStatus: z.enum(apStatuses),
})
function apCardWith<T extends z.ZodRawShape>(extra: T) {
  return z.discriminatedUnion('docType', [
    poApCardSchema.extend(extra),
    whApCardSchema.extend(extra),
  ])
}
export const apCardSchema = apCardWith({})
export type ApCard = z.infer<typeof apCardSchema>
const totals = {
  payableCents: centsSchema,
  paidCents: centsSchema,
  unpaidCents: centsSchema,
  prepaidCents: centsSchema,
}
const statement = countedPageSchema(apCardSchema, apStatuses).extend({
  supplierId: idSchema,
  supplierName: z.string(),
  ...totals,
  refunds: z.array(refundSchema),
})
const statementQuery = pageQuerySchema
  .extend({
    status: z.enum(apStatuses).optional(),
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)
export const listPayables = {
  method: 'GET',
  path: '/finance/payables',
  grants: ['finance'],
  query: pageQuerySchema,
  response: pageSchema(apCardSchema),
  errors: [],
} as const satisfies Endpoint
export const listFinanceSuppliers = {
  method: 'GET',
  path: '/finance/suppliers',
  grants: ['finance'],
  query: pageQuerySchema.extend({ q: z.string().trim().optional() }),
  response: pageSchema(
    z.object({ supplierId: idSchema, supplierName: z.string(), enabled: z.boolean(), ...totals }),
  ),
  errors: [],
} as const satisfies Endpoint
export const getFinanceSupplier = {
  method: 'GET',
  path: '/finance/suppliers/:id',
  grants: ['finance'],
  params: idParamsSchema,
  query: statementQuery,
  response: statement,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const supplierStatement = {
  method: 'GET',
  path: '/supplier/statement',
  grants: ['supplier'],
  query: statementQuery,
  response: statement.omit({ refunds: true }).extend({
    items: z.array(apCardWith({ allocations: z.array(externalAllocationSchema) })),
    refunds: z.array(
      z.object({
        no: z.string(),
        date: z.string(),
        amountCents: centsSchema,
        status: z.enum(['valid', 'voided']),
      }),
    ),
  }),
  errors: [],
} as const satisfies Endpoint
export const getApDocument = {
  method: 'GET',
  path: '/finance/ap-documents/:docType/:id',
  grants: ['finance'],
  params: z.object({ docType: z.enum(['po', 'wh']), id: idSchema }),
  response: z.discriminatedUnion('docType', [
    poDetailSchema.extend({
      docType: z.literal('po'),
      allocations: z.array(paymentAllocationSchema),
    }),
    whDocDetailSchema.extend({ docType: z.literal('wh') }),
  ]),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const listUnpaidDocuments = {
  method: 'GET',
  path: '/finance/suppliers/:id/unpaid-docs',
  grants: ['finance'],
  params: idParamsSchema,
  response: z.object({
    ledgerToken: ledgerTokenSchema,
    prepaidCents: centsSchema,
    items: z.array(apCardWith({ notice: z.string().nullable() })),
  }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
