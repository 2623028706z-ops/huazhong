// 操作日志（05 章第 3 节、06 章 M6）：管理员看全部（含公共），员工只看自己模块
import * as z from 'zod'
import { moduleKeys } from '../enums.ts'
import { idSchema, timestampSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'

export const logQuerySchema = pageQuerySchema
  .extend({ module: z.enum(moduleKeys).optional(), ...dateRangeShape })
  .superRefine(checkDateRange)

export const logItemSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  // null = 公共（账号类操作，只有管理员能看）
  module: z.enum(moduleKeys).nullable(),
  kind: z.string(),
  action: z.string(),
  targetLabel: z.string(),
  actorLabel: z.string(),
})
export type LogItem = z.infer<typeof logItemSchema>

// 修改前后是给人看的业务视图：字段中文名 → 显示值，一行一项
const logViewSchema = z.record(z.string(), z.string()).nullable()

export const logDetailSchema = logItemSchema.extend({
  reason: z.string(),
  before: logViewSchema,
  after: logViewSchema,
})
export type LogDetail = z.infer<typeof logDetailSchema>

export const listLogs = {
  method: 'GET',
  path: '/logs',
  grants: ['staff'],
  query: logQuerySchema,
  response: pageSchema(logItemSchema),
  errors: [],
} as const satisfies Endpoint

export const getLog = {
  method: 'GET',
  path: '/logs/:id',
  grants: ['staff'],
  params: idParamsSchema,
  response: logDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
