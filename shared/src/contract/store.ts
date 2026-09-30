// 门店端（05 章第 5 节）。阶段 2 只有门店首页的客户停用提示，orderableCount 在阶段 3 加（08 章）
import * as z from 'zod'
import type { Endpoint } from './endpoint.ts'

export const storeHomeSchema = z.object({
  // 客户停用时的一句提示，否则 null
  lockedReason: z.string().nullable(),
})
export type StoreHome = z.infer<typeof storeHomeSchema>

export const storeHome = {
  method: 'GET',
  path: '/store/home',
  grants: ['store'],
  response: storeHomeSchema,
  errors: [],
} as const satisfies Endpoint
