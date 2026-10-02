// 模块首页待办（05 章第 3 节）：最多 TODO_PREVIEW_COUNT 条，count 是全部条数。
// 销售 = 待确认订单 + 待处理售后；发货 = 出货日期不晚于今天的待发货；采购 = 待填报；仓库 = 待收货；财务 = 待付款 + 有预收
import * as z from 'zod'
import { todoModules } from '../enums.ts'
import { centsSchema, idSchema } from '../rules.ts'
import { afterCardSchema } from './afters.ts'
import type { Endpoint } from './endpoint.ts'
import { orderCardSchema } from './orders.ts'
import { inviteCardSchema, poCardSchema } from './purchase.ts'
import { apCardSchema } from './ap.ts'

export const todoItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('order'), order: orderCardSchema }),
  z.object({ kind: z.literal('after'), after: afterCardSchema }),
  z.object({
    kind: z.literal('prepaid'),
    customerId: idSchema,
    customerName: z.string(),
    prepaidCents: centsSchema,
  }),
  z.object({
    kind: z.literal('invite'),
    invite: inviteCardSchema,
  }),
  z.object({
    kind: z.literal('purchaseOrder'),
    purchaseOrder: poCardSchema,
  }),
  z.object({ kind: z.literal('payable'), payable: apCardSchema }),
])
export type TodoItem = z.infer<typeof todoItemSchema>

export const moduleTodos = {
  method: 'GET',
  path: '/modules/:key/todos',
  // 还要有这个模块的权限（service 里查）
  grants: ['staff'],
  params: z.object({ key: z.enum(todoModules) }),
  response: z.object({ count: z.number().int().nonnegative(), items: z.array(todoItemSchema) }),
  errors: [],
} as const satisfies Endpoint
