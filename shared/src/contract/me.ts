// GET /me：当前账号、登录落点、「我的」入口（05 章第 2 节）
import * as z from 'zod'
import { accountTypes, moduleKeys } from '../enums.ts'
import { idSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'

export const menuCodes = ['inventory', 'logs', 'staff'] as const

export const landingSchema = z.union([
  z.enum(['store_home', 'supplier_home', 'home']),
  z.templateLiteral(['module:', z.enum(moduleKeys)]),
])

export const meResponseSchema = z.object({
  id: idSchema,
  type: z.enum(accountTypes),
  name: z.string(),
  phone: z.string(),
  orgLabel: z.string().nullable(),
  storeId: idSchema.nullable(),
  supplierId: idSchema.nullable(),
  modules: z.array(z.enum(moduleKeys)),
  landing: landingSchema,
  menus: z.array(z.enum(menuCodes)),
})
export type Me = z.infer<typeof meResponseSchema>

export const me = {
  method: 'GET',
  path: '/me',
  grants: 'any',
  response: meResponseSchema,
  errors: [],
} as const satisfies Endpoint
