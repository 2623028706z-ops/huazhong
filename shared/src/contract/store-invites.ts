// 门店邀请下单的链接（05 章第 2 节，06 章 M2）：任何 openid 能打开（可未绑定）。
// 已绑了别的账号的微信要先退出登录；已是这家门店的账号直接进订货（阶段 3 确认）
import * as z from 'zod'
import { storeInviteStatuses } from '../enums.ts'
import { timestampSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { meResponseSchema } from './me.ts'

// 分享卡片的路径（06 章第 11 节）：M2 链接落地页按 t、token 解析
export function storeInvitePath(token: string): string {
  return `/pages/link/index?t=store&token=${token}`
}

const tokenParamsSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })

export const storeInviteViewSchema = z.object({
  storeLabel: z.string(),
  status: z.enum(storeInviteStatuses),
  expiresAt: timestampSchema,
  // 这台微信：没绑账号、已是这家门店的账号、绑了别的账号
  binding: z.enum(['none', 'self', 'other']),
  // binding 为 other 时那个账号的名字，其余为 null
  boundLabel: z.string().nullable(),
})
export type StoreInviteView = z.infer<typeof storeInviteViewSchema>

export const getStoreInvite = {
  method: 'GET',
  path: '/store-invites/:token',
  grants: 'openid',
  params: tokenParamsSchema,
  response: storeInviteViewSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

export const useStoreInvite = {
  method: 'POST',
  path: '/store-invites/:token/use',
  grants: 'openid',
  params: tokenParamsSchema,
  // 手机号快速验证的动态令牌
  body: z.object({ code: z.string().min(1) }),
  response: meResponseSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
