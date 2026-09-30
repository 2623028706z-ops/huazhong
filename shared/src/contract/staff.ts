// 员工与岗位（05 章第 3 节、06 章 M7）：只有管理员能用
import * as z from 'zod'
import { copy } from '../copy.ts'
import { moduleKeys } from '../enums.ts'
import { idSchema, PHONE_PATTERN, versionSchema } from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageQuerySchema, pageSchema } from './page.ts'

const staffFieldsShape = {
  name: z.string().trim().min(1, { error: copy.staff.nameRequired }),
  phone: z.string().regex(new RegExp(PHONE_PATTERN), { error: copy.staff.phoneInvalid }),
  admin: z.boolean(),
  // 管理员默认全部模块，不存；普通员工至少一个
  modules: z.array(z.enum(moduleKeys)),
}

function checkModules(value: { admin: boolean; modules: unknown[] }, ctx: z.RefinementCtx): void {
  if (!value.admin && value.modules.length === 0) {
    ctx.addIssue({ code: 'custom', message: copy.staff.modulesRequired, path: ['modules'] })
  }
}

export const staffCreateSchema = z.object(staffFieldsShape).superRefine(checkModules)
export type StaffCreate = z.infer<typeof staffCreateSchema>

export const staffUpdateSchema = z
  .object({ ...staffFieldsShape, version: versionSchema, enabled: z.boolean() })
  .superRefine(checkModules)
export type StaffUpdate = z.infer<typeof staffUpdateSchema>

export const staffItemSchema = z.object({
  id: idSchema,
  version: versionSchema,
  name: z.string(),
  phone: z.string(),
  admin: z.boolean(),
  modules: z.array(z.enum(moduleKeys)),
  enabled: z.boolean(),
  // 只可能有 unbindStaffWechat（已绑定微信时）
  actions: z.array(actionSchema),
})
export type StaffItem = z.infer<typeof staffItemSchema>

export const listStaff = {
  method: 'GET',
  path: '/staff',
  grants: ['admin'],
  query: pageQuerySchema,
  response: pageSchema(staffItemSchema),
  errors: [],
} as const satisfies Endpoint

export const createStaff = {
  method: 'POST',
  path: '/staff',
  grants: ['admin'],
  body: staffCreateSchema,
  response: staffItemSchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint

export const updateStaff = {
  method: 'PATCH',
  path: '/staff/:id',
  grants: ['admin'],
  params: idParamsSchema,
  body: staffUpdateSchema,
  response: staffItemSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const unbindStaffWechat = {
  method: 'POST',
  path: '/staff/:id/unbind-wechat',
  grants: ['admin'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema }),
  response: staffItemSchema,
  errors: ['NOT_FOUND', 'STALE'],
} as const satisfies Endpoint
