import * as z from 'zod'
import { apStatuses } from '../enums.ts'
import { centsSchema, idSchema } from '../rules.ts'
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
import { paymentSchema } from './payments.ts'

export const apCardSchema = poCardSchema.extend({
  docType: z.literal('po'),
  docId: idSchema,
  paidCents: centsSchema,
  unpaidCents: centsSchema,
})
export type ApCard = z.infer<typeof apCardSchema>
const totals = { payableCents: centsSchema, paidCents: centsSchema, unpaidCents: centsSchema }
const statement = countedPageSchema(apCardSchema, apStatuses).extend({
  supplierId: idSchema,
  supplierName: z.string(),
  ...totals,
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
  response: statement,
  errors: [],
} as const satisfies Endpoint
export const getPayable = {
  method: 'GET',
  path: '/finance/payables/:docType/:id',
  grants: ['finance'],
  params: z.object({ docType: z.literal('po'), id: idSchema }),
  response: poDetailSchema.extend({ payment: paymentSchema.nullable() }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
