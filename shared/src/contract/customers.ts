// 客户、门店、门店邀请（05 章第 4 节主数据、06 章 X8）：销售维护，财务只读
import * as z from 'zod'
import { copy } from '../copy.ts'
import { storeInviteStatuses } from '../enums.ts'
import {
  idSchema,
  PHONE_PATTERN,
  requiredIdSchema,
  requiredTextSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageQuerySchema, pageSchema } from './page.ts'

export const storeItemSchema = z.object({
  id: idSchema,
  version: versionSchema,
  customerId: idSchema,
  name: z.string(),
  contact: z.string(),
  phone: z.string(),
  address: z.string(),
  enabled: z.boolean(),
  // 门店账号的登录手机号；没开通为 null
  loginPhone: z.string().nullable(),
  // 门店账号的版本号（解绑微信时带上）；没开通为 null
  accountVersion: versionSchema.nullable(),
  // ⊆ inviteStore、unbindStoreWechat
  actions: z.array(actionSchema),
})
export type StoreItem = z.infer<typeof storeItemSchema>

export const customerItemSchema = z.object({
  id: idSchema,
  version: versionSchema,
  name: z.string(),
  enabled: z.boolean(),
  stores: z.array(storeItemSchema),
  overdue: z
    .object({ amountCents: z.number().int().positive(), days: z.number().int().positive() })
    .nullable(),
})
export type CustomerItem = z.infer<typeof customerItemSchema>

const customerFieldsShape = {
  name: requiredTextSchema(copy.catalog.customerNameRequired),
  enabled: z.boolean(),
}

const phonePattern = new RegExp(PHONE_PATTERN)
// 空字符串 = 不开通（已开通的会停用门店账号）
const loginPhoneSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || phonePattern.test(value), {
    error: copy.catalog.loginPhoneInvalid,
  })

const storeFieldsShape = {
  name: requiredTextSchema(copy.catalog.storeNameRequired),
  contact: z.string().trim(),
  phone: z.string().trim(),
  address: z.string().trim(),
  enabled: z.boolean(),
  loginPhone: loginPhoneSchema,
}

// 开通门店账号要写联系人：门店账号的名字就是联系人（阶段 3 确认）
function checkContact(value: { contact: string; loginPhone: string }, ctx: z.RefinementCtx) {
  if (value.loginPhone !== '' && value.contact === '') {
    ctx.addIssue({ code: 'custom', message: copy.catalog.contactRequired, path: ['contact'] })
  }
}

export const storeCreateSchema = z
  .object({ customerId: requiredIdSchema(copy.catalog.customerRequired), ...storeFieldsShape })
  .superRefine(checkContact)
export type StoreCreate = z.infer<typeof storeCreateSchema>

// 门店建好后不能换客户（历史订单挂在客户下）
export const storeUpdateSchema = z
  .object({ version: versionSchema, ...storeFieldsShape })
  .superRefine(checkContact)
export type StoreUpdate = z.infer<typeof storeUpdateSchema>

export const listCustomers = {
  method: 'GET',
  path: '/customers',
  grants: ['sales', 'finance'],
  query: pageQuerySchema,
  // 列表级 actions ⊆ create（新建门店）、createCustomer
  response: pageSchema(customerItemSchema),
  errors: [],
} as const satisfies Endpoint

export const createCustomer = {
  method: 'POST',
  path: '/customers',
  grants: ['sales'],
  body: z.object(customerFieldsShape),
  response: customerItemSchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint

export const updateCustomer = {
  method: 'PATCH',
  path: '/customers/:id',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema, ...customerFieldsShape }),
  response: customerItemSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const createStore = {
  method: 'POST',
  path: '/stores',
  grants: ['sales'],
  body: storeCreateSchema,
  response: storeItemSchema,
  errors: ['NOT_FOUND'],
  idempotent: true,
} as const satisfies Endpoint

export const updateStore = {
  method: 'PATCH',
  path: '/stores/:id',
  grants: ['sales'],
  params: idParamsSchema,
  body: storeUpdateSchema,
  response: storeItemSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const unbindStoreWechat = {
  method: 'POST',
  path: '/stores/:id/unbind-wechat',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema }),
  response: storeItemSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const storeInviteSchema = z.object({
  id: idSchema,
  // 已过期的按 expires_at 现算
  status: z.enum(storeInviteStatuses),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  boundAt: timestampSchema.nullable(),
})
export type StoreInvite = z.infer<typeof storeInviteSchema>

export const createStoreInvite = {
  method: 'POST',
  path: '/stores/:id/invites',
  grants: ['sales'],
  params: idParamsSchema,
  // 小程序卡片参数：path 带随机 token；图片用内置品牌背景（06 章第 11 节）
  response: z.object({
    id: idSchema,
    path: z.string(),
    title: z.string(),
    expiresAt: timestampSchema,
  }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

export const listStoreInvites = {
  method: 'GET',
  path: '/stores/:id/invites',
  grants: ['sales'],
  params: idParamsSchema,
  response: pageSchema(storeInviteSchema),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
