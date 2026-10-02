import * as z from 'zod'
import { copy } from '../copy.ts'
import { idSchema, requiredTextSchema, versionSchema, PHONE_PATTERN } from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageQuerySchema, pageSchema } from './page.ts'

const supplierFields = {
  name: requiredTextSchema(copy.finance.supplierNameRequired),
  contact: z.string().trim(),
  phone: z.string().trim(),
  address: z.string().trim(),
  enabled: z.boolean(),
  account: z.object({ enabled: z.boolean(), loginPhone: z.string().trim() }),
}
const supplierInput = z.object(supplierFields).superRefine((value, ctx) => {
  if (value.account.enabled && !new RegExp(PHONE_PATTERN).test(value.account.loginPhone)) {
    ctx.addIssue({
      code: 'custom',
      message: copy.finance.supplierAccountRequired,
      path: ['account', 'loginPhone'],
    })
  }
})
export const supplierSchema = z.object({
  id: idSchema,
  version: versionSchema,
  name: z.string(),
  contact: z.string(),
  phone: z.string(),
  address: z.string(),
  enabled: z.boolean(),
  hasAccount: z.boolean(),
  account: z.object({
    id: idSchema.nullable(),
    enabled: z.boolean(),
    loginPhone: z.string(),
    bound: z.boolean(),
  }),
  openPoCount: z.number().int().nonnegative(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type Supplier = z.infer<typeof supplierSchema>
export const listSuppliers = {
  method: 'GET',
  path: '/suppliers',
  grants: ['purchase', 'finance', 'warehouse'],
  query: pageQuerySchema.extend({
    q: z.string().trim().optional(),
    enabled: z.enum(['true', 'false']).optional(),
    hasAccount: z.enum(['true', 'false']).optional(),
  }),
  response: pageSchema(supplierSchema),
  errors: [],
} as const satisfies Endpoint
export const getSupplier = {
  method: 'GET',
  path: '/suppliers/:id',
  grants: ['purchase', 'finance', 'warehouse'],
  params: idParamsSchema,
  response: supplierSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const createSupplier = {
  method: 'POST',
  path: '/suppliers',
  grants: ['purchase'],
  body: supplierInput,
  response: supplierSchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint
export const updateSupplier = {
  method: 'PATCH',
  path: '/suppliers/:id',
  grants: ['purchase'],
  params: idParamsSchema,
  body: supplierInput.safeExtend({ version: versionSchema }),
  response: supplierSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
