// 首页只展示后端计算的待办汇总，点击进入业务列表。
import * as z from 'zod'
import { todoModules } from '../enums.ts'
import { centsSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
export const todoRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  amountCents: centsSchema.optional(),
})
export type TodoRow = z.infer<typeof todoRowSchema>
export const moduleTodos = {
  method: 'GET',
  path: '/modules/:key/todos',
  grants: ['staff'],
  params: z.object({ key: z.enum(todoModules) }),
  response: z.object({ count: z.number().int().nonnegative(), rows: z.array(todoRowSchema) }),
  errors: [],
} as const satisfies Endpoint
