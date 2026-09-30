// 员工弹层的表单（06 章 M7）：初始值、即时校验（和后端同一份 Zod 规则）、提交的请求体
import {
  fieldsOf,
  moduleKeys,
  staffCreateSchema,
  staffUpdateSchema,
  type ModuleKey,
  type StaffItem,
} from '@huazhong/shared'

export interface StaffForm {
  name: string
  phone: string
  admin: boolean
  // 管理员开关打开时隐藏，但保留原来选的，关掉就恢复（03 章第 8.5 节）
  modules: ModuleKey[]
  enabled: boolean
}

export const blankForm: StaffForm = {
  name: '',
  phone: '',
  admin: false,
  modules: [],
  enabled: true,
}

export function formOf(item: StaffItem): StaffForm {
  return {
    name: item.name,
    phone: item.phone,
    admin: item.admin,
    modules: [...item.modules],
    enabled: item.enabled,
  }
}

// 只比较会提交的内容：管理员的模块不提交，改了也不算修改
export function comparableOf(form: StaffForm): StaffForm {
  return { ...form, modules: form.admin ? [] : form.modules }
}

export function toModules(ids: string[]): ModuleKey[] {
  return moduleKeys.filter((key) => ids.includes(key))
}

type Checked<T> = { ok: true; body: T } | { ok: false; fields: Record<string, string> }

function check<T>(
  parsed: { success: true; data: T } | { success: false; error: Parameters<typeof fieldsOf>[0] },
): Checked<T> {
  return parsed.success
    ? { ok: true, body: parsed.data }
    : { ok: false, fields: fieldsOf(parsed.error) }
}

export function checkCreate(form: StaffForm) {
  const { name, phone, admin, modules } = comparableOf(form)
  return check(staffCreateSchema.safeParse({ name, phone, admin, modules }))
}

export function checkUpdate(form: StaffForm, version: number) {
  return check(staffUpdateSchema.safeParse({ ...comparableOf(form), version }))
}
