// 登录绑定（05 章第 2 节）：只要有 openid 就能调，未绑定、已停用的也能调
import * as z from 'zod'
import type { Endpoint } from './endpoint.ts'
import { meResponseSchema } from './me.ts'

export const bindPhone = {
  method: 'POST',
  path: '/auth/bind-phone',
  grants: 'openid',
  // getPhoneNumber 返回的动态令牌
  body: z.object({ code: z.string().min(1) }),
  response: meResponseSchema,
  errors: ['BUSINESS_RULE'],
} as const satisfies Endpoint

// 退出登录 = 解绑自己这台微信；停用的账号也能退出
export const unbind = {
  method: 'POST',
  path: '/auth/unbind',
  grants: 'openid',
  response: z.object({}),
  errors: [],
} as const satisfies Endpoint
