// 收付款方式（05 章第 10 节，06 章 F9）：收款、付款各一份，财务新增、启用 / 停用，每份至少一种启用
import * as z from 'zod'
import { copy } from '../copy.ts'
import { methodKinds } from '../enums.ts'
import { idSchema, requiredTextSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageSchema } from './page.ts'

export const paymentMethodSchema = z.object({
  id: idSchema,
  kind: z.enum(methodKinds),
  name: z.string(),
  enabled: z.boolean(),
  sort: z.number().int(),
})
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const listMethods = {
  method: 'GET',
  path: '/finance/methods',
  grants: ['finance'],
  query: z.object({ kind: z.enum(methodKinds).optional() }),
  response: pageSchema(paymentMethodSchema),
  errors: [],
} as const satisfies Endpoint

export const createMethod = {
  method: 'POST',
  path: '/finance/methods',
  grants: ['finance'],
  body: z.object({
    kind: z.enum(methodKinds),
    name: requiredTextSchema(copy.finance.methodNameRequired),
  }),
  response: paymentMethodSchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint

export const updateMethod = {
  method: 'PATCH',
  path: '/finance/methods/:id',
  grants: ['finance'],
  params: idParamsSchema,
  body: z.object({ enabled: z.boolean() }),
  response: paymentMethodSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
