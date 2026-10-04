import * as z from 'zod'
import { centsSchema } from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'
import {
  signedCentsSchema,
  statementCardSchema,
  statementGroupSchema,
  settlementSchema,
} from './finance.ts'
import { statementStatusSchema } from './statement-ref.ts'
const listQuery = pageQuerySchema
  .extend({ status: statementStatusSchema.optional(), ...dateRangeShape })
  .superRefine(checkDateRange)
export const externalStatementCardSchema = statementCardSchema
  .omit({ actions: true, lockedReason: true })
  .extend({ storeAmountCents: signedCentsSchema.nullable() })
export const externalStatementListSchema = pageSchema(externalStatementCardSchema).extend({
  counts: z.record(z.string(), z.number().int().nonnegative()),
  unsettledCents: signedCentsSchema,
  unstatementedCents: signedCentsSchema,
})
export const storeStatementDetailSchema = externalStatementCardSchema.extend({
  storeName: z.string(),
  shippedCents: centsSchema,
  afterCents: centsSchema,
  groups: z.array(statementGroupSchema),
  actions: z.array(actionSchema),
})
export const supplierStatementDetailSchema = externalStatementCardSchema.extend({
  receivedCents: centsSchema,
  returnCents: centsSchema,
  openingDebtCents: centsSchema,
  creditDeductedCents: centsSchema,
  groups: z.array(statementGroupSchema),
  settlements: z.array(settlementSchema),
  actions: z.array(actionSchema),
})
export const storeStatements = {
  method: 'GET',
  path: '/store/statements',
  grants: ['store'],
  query: listQuery,
  response: externalStatementListSchema,
  errors: [],
} as const satisfies Endpoint
export const supplierStatements = {
  ...storeStatements,
  path: '/supplier/statements',
  grants: ['supplier'],
} as const satisfies Endpoint
export const storeStatementDetail = {
  method: 'GET',
  path: '/store/statements/:id',
  grants: ['store'],
  params: idParamsSchema,
  response: storeStatementDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const supplierStatementDetail = {
  ...storeStatementDetail,
  path: '/supplier/statements/:id',
  grants: ['supplier'],
  response: supplierStatementDetailSchema,
} as const satisfies Endpoint
