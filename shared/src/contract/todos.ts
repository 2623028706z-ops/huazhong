// 首页只展示后端计算的待办汇总，点击进入业务列表。待办只放「该我动手」的事（03 章第 8.5 节）
import * as z from 'zod'
import { todoModules } from '../enums.ts'
import type { Endpoint } from './endpoint.ts'
export const todoRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
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

// 花众首页（M3）模块格子角标：当前账号有权限的模块各一项，没权限的模块不出现
export const moduleTodoCounts = {
  method: 'GET',
  path: '/modules/todos',
  grants: ['staff'],
  response: z.object({
    counts: z.array(z.object({ key: z.enum(todoModules), count: z.number().int().nonnegative() })),
  }),
  errors: [],
} as const satisfies Endpoint
