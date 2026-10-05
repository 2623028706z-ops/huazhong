import * as z from 'zod'
import { statementCopy } from '../copy-statements.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  timestampSchema,
  versionSchema,
  STORED_INT_MAX,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'
import { actorSchema, refundSchema } from './ledger.ts'
import { statementKindSchema, statementStatusSchema } from './statement-ref.ts'
export { statementKindSchema, statementStatusSchema } from './statement-ref.ts'
export const signedCentsSchema = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
export const statementSourceTypeSchema = z.enum([
  'order',
  'after',
  'po',
  'wh',
  'purchase_return',
  'price_change',
])
export const statementSourceSchema = z.object({
  type: statementSourceTypeSchema,
  id: idSchema,
  version: versionSchema.nullable(),
  sourceNo: z.string(),
  sourceDate: businessDateSchema,
  storeId: idSchema.nullable(),
  storeName: z.string().nullable(),
  amountCents: signedCentsSchema,
  carriesAmount: z.boolean(),
  previousPeriod: z.boolean(),
  selected: z.boolean(),
  parentType: z.enum(['po', 'wh']).optional(),
  parentId: idSchema.optional(),
})
export type StatementSource = z.infer<typeof statementSourceSchema>
export const statementGroupSchema = z.object({
  storeId: idSchema.nullable(),
  storeName: z.string().nullable(),
  amountCents: signedCentsSchema,
  sources: z.array(statementSourceSchema),
})
export const settlementSchema = z.object({
  id: idSchema,
  no: z.string(),
  kind: z.enum(['receipt', 'payment']),
  date: businessDateSchema,
  // 收付款本身的金额（不含优惠），一行收款记录显示这个
  amountCents: centsSchema,
  // 这一笔的优惠和多收（整笔的，不是分到这张对账单的）
  discountCents: centsSchema,
  creditCents: centsSchema,
  // 这笔钱核销了这张对账单多少（= 这张的应收）
  coveredCents: centsSchema,
  // 其中算优惠的部分（一笔核销几张时，优惠按对账单从早到晚先抵）和实收部分
  appliedDiscountCents: centsSchema,
  receivedCents: centsSchema,
  methodName: z.string(),
  status: z.enum(['valid', 'voided']),
  reversedAt: timestampSchema.nullable(),
})
export const statementCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  kind: statementKindSchema,
  partyId: idSchema,
  partyName: z.string(),
  periodFrom: businessDateSchema,
  periodTo: businessDateSchema,
  statementDate: businessDateSchema,
  dueDate: businessDateSchema.nullable(),
  settledAt: timestampSchema.nullable(),
  amountCents: centsSchema,
  dueCents: centsSchema,
  sourceCount: z.number().int().nonnegative(),
  status: statementStatusSchema,
  overdueDays: z.number().int().nonnegative(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type StatementCard = z.infer<typeof statementCardSchema>
export const statementDetailSchema = statementCardSchema.extend({
  createdBy: actorSchema,
  createdAt: timestampSchema,
  note: z.string(),
  voidReason: z.string().nullable(),
  voidedBy: actorSchema.nullable(),
  voidedAt: timestampSchema.nullable(),
  grossCents: signedCentsSchema,
  openingDebtCents: centsSchema,
  creditDeductedCents: centsSchema,
  creditGeneratedCents: centsSchema,
  shippedCents: centsSchema,
  afterCents: centsSchema,
  receivedCents: centsSchema,
  returnCents: centsSchema,
  // 实际收到（付出）的钱，不含优惠；优惠单列
  settledCents: centsSchema,
  settledDiscountCents: centsSchema,
  groups: z.array(statementGroupSchema),
  settlements: z.array(settlementSchema),
})
export type StatementDetail = z.infer<typeof statementDetailSchema>
export const statementDraftSchema = z.object({
  kind: statementKindSchema,
  partyId: idSchema,
  partyName: z.string(),
  partyVersion: versionSchema,
  periodFrom: businessDateSchema,
  periodTo: businessDateSchema,
  creditCents: centsSchema,
  openingDebtCents: centsSchema,
  sources: z.array(statementSourceSchema),
  totals: z.object({
    grossCents: signedCentsSchema,
    creditDeductedCents: centsSchema,
    dueCents: centsSchema,
    creditGeneratedCents: centsSchema,
  }),
})
export type StatementDraft = z.infer<typeof statementDraftSchema>
export const statementCreateSchema = z
  .object({
    kind: statementKindSchema,
    partyId: idSchema,
    partyVersion: versionSchema,
    periodFrom: businessDateSchema,
    periodTo: businessDateSchema,
    note: z.string().trim(),
    creditCents: centsSchema,
    sources: z.array(
      z.object({
        type: statementSourceTypeSchema,
        id: idSchema,
        version: versionSchema.nullable().optional(),
        amountCents: signedCentsSchema,
      }),
    ),
  })
  .superRefine((value, ctx) => {
    checkDateRange({ from: value.periodFrom, to: value.periodTo }, ctx)
    const seen = new Set<string>()
    value.sources.forEach((source, index) => {
      const key = source.type + ':' + source.id
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'id'],
          message: statementCopy.duplicateSource,
        })
      seen.add(key)
    })
  })
export type StatementCreate = z.infer<typeof statementCreateSchema>
export const statementListSchema = pageSchema(statementCardSchema).extend({
  counts: z.record(z.string(), z.number().int().nonnegative()),
})
export const partySummarySchema = z.object({
  kind: statementKindSchema,
  partyId: idSchema,
  partyName: z.string(),
  enabled: z.boolean(),
  outstandingCents: centsSchema,
  unsettledCents: centsSchema,
  unsettledCount: z.number().int().nonnegative(),
  unstatementedCents: signedCentsSchema,
  creditCents: centsSchema,
  lastStatementTo: businessDateSchema.nullable(),
  lastFundDate: businessDateSchema.nullable(),
  overdueCents: centsSchema,
  overdueDays: z.number().int().nonnegative(),
})
export const termsSchema = z.object({
  version: versionSchema,
  termDays: z.number().int().nonnegative().max(STORED_INT_MAX).nullable(),
  openingDebtCents: centsSchema,
  openingDebtEditable: z.boolean(),
})
export const partyLedgerSchema = statementListSchema.extend({
  ...partySummarySchema.shape,
  ...termsSchema.shape,
  sources: z.array(statementSourceSchema),
  refunds: z.array(refundSchema),
})
export type PartyLedger = z.infer<typeof partyLedgerSchema>
const partyQuery = pageQuerySchema.extend({
  q: z.string().trim().optional(),
  filter: z.enum(['outstanding', 'overdue', 'unstatemented']).optional(),
})
const ledgerQuery = pageQuerySchema
  .extend({
    tab: z.enum(['statements', 'unstatemented']).default('statements'),
    status: statementStatusSchema.optional(),
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)
export const listArCustomers = {
  method: 'GET',
  path: '/finance/customers',
  grants: ['finance'],
  query: partyQuery,
  response: pageSchema(partySummarySchema),
  errors: [],
} as const satisfies Endpoint
export const getArCustomer = {
  method: 'GET',
  path: '/finance/customers/:id',
  grants: ['finance'],
  params: idParamsSchema,
  query: ledgerQuery,
  response: partyLedgerSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const listFinanceSuppliers = {
  ...listArCustomers,
  path: '/finance/suppliers',
} as const satisfies Endpoint
export const getFinanceSupplier = {
  ...getArCustomer,
  path: '/finance/suppliers/:id',
} as const satisfies Endpoint
export const statementDraft = {
  method: 'GET',
  path: '/finance/statements/draft',
  grants: ['finance'],
  query: z
    .object({ kind: statementKindSchema, partyId: idSchema, ...dateRangeShape })
    .superRefine(checkDateRange),
  response: statementDraftSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const listStatements = {
  method: 'GET',
  path: '/finance/statements',
  grants: ['finance'],
  query: pageQuerySchema
    .extend({
      kind: statementKindSchema.optional(),
      partyId: idSchema.optional(),
      status: statementStatusSchema.optional(),
      ...dateRangeShape,
    })
    .superRefine(checkDateRange),
  response: statementListSchema,
  errors: [],
} as const satisfies Endpoint
export const createStatement = {
  method: 'POST',
  path: '/finance/statements',
  grants: ['finance'],
  body: statementCreateSchema,
  response: statementDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const getStatement = {
  method: 'GET',
  path: '/finance/statements/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: statementDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const getBusinessStatement = {
  ...getStatement,
  path: '/statements/:id',
  grants: ['sales', 'purchase', 'warehouse'],
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const voidStatement = {
  method: 'POST',
  path: '/finance/statements/:id/void',
  grants: ['finance'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: z.string().trim().min(1, statementCopy.voidReasonRequired),
  }),
  response: statementDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE', 'FORBIDDEN'],
} as const satisfies Endpoint
export const shareStatement = {
  method: 'POST',
  path: '/finance/statements/:id/share',
  grants: ['finance'],
  params: idParamsSchema,
  response: z.object({
    generatedAt: timestampSchema,
    shareData: statementDetailSchema.omit({
      actions: true,
      lockedReason: true,
      note: true,
      voidReason: true,
      voidedBy: true,
      voidedAt: true,
    }),
  }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
const unsettledResponse = z.object({
  partyId: idSchema,
  creditCents: centsSchema,
  items: z.array(statementCardSchema),
  actions: z.array(actionSchema),
})
export const listUnsettledCustomerStatements = {
  method: 'GET',
  path: '/finance/customers/:id/unsettled-statements',
  grants: ['finance'],
  params: idParamsSchema,
  response: unsettledResponse,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const listUnsettledSupplierStatements = {
  ...listUnsettledCustomerStatements,
  path: '/finance/suppliers/:id/unsettled-statements',
} as const satisfies Endpoint
const termsBody = z.object({
  version: versionSchema,
  termDays: z.number().int().nonnegative().max(STORED_INT_MAX).nullable(),
  openingDebtCents: centsSchema.max(STORED_INT_MAX).optional(),
})
export const customerTerms = {
  method: 'GET',
  path: '/finance/customers/:id/terms',
  grants: ['finance'],
  params: idParamsSchema,
  response: termsSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const supplierTerms = {
  ...customerTerms,
  path: '/finance/suppliers/:id/terms',
} as const satisfies Endpoint
export const updateCustomerTerms = {
  ...customerTerms,
  method: 'PATCH',
  body: termsBody,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const updateSupplierTerms = {
  ...updateCustomerTerms,
  path: '/finance/suppliers/:id/terms',
} as const satisfies Endpoint
const todoQuery = pageQuerySchema.extend({ overdue: z.enum(['true', 'false']).optional() })
export const listReceivables = {
  method: 'GET',
  path: '/finance/receivables',
  grants: ['finance'],
  query: todoQuery,
  response: statementListSchema,
  errors: [],
} as const satisfies Endpoint
export const listPayables = {
  ...listReceivables,
  path: '/finance/payables',
} as const satisfies Endpoint
