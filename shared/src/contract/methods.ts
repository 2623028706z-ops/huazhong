// 收付款方式（05 章第 10 节，06 章 F9）：一份列表，收款、付款、退款通用；财务新增、启用 / 停用，至少一种启用
// 2026-10-03 确认：收付款方式合并成一份
import * as z from 'zod'
import { copy } from '../copy.ts'
import { idSchema, requiredTextSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageSchema } from './page.ts'

export const paymentMethodSchema = z.object({
  id: idSchema,
  name: z.string(),
  enabled: z.boolean(),
  sort: z.number().int(),
})
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const listMethods = {
  method: 'GET',
  path: '/finance/methods',
  grants: ['finance'],
  response: pageSchema(paymentMethodSchema),
  errors: [],
} as const satisfies Endpoint

export const createMethod = {
  method: 'POST',
  path: '/finance/methods',
  grants: ['finance'],
  body: z.object({
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
