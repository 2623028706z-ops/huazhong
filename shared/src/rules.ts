// 字段规则：接口契约、前端表单、数据库 CHECK 引用同一份（01 章第 1 节）
import * as z from 'zod'
import { copy } from './copy.ts'

// 规则没写专门提示时，统一用这句（02 章第 5.3 节）
z.config({ customError: () => copy.error.validationFallback })

// 数据库 CHECK 用同一个字符串（server/db/schema）
export const PHONE_PATTERN = '^1[0-9]{10}$'

export const idSchema = z.string().regex(/^[1-9][0-9]*$/)
export const phoneSchema = z.string().regex(new RegExp(PHONE_PATTERN))
export const centsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
export const qtySchema = z.number().int().positive()
export const businessDateSchema = z.iso.date()
export const timestampSchema = z.iso.datetime({ precision: 3 })
export const versionSchema = z.number().int().positive()

// Zod 的报错转成 VALIDATION_FAILED 的 fields：键是字段路径，明细行写 lines.0.qty（05 章第 1.4 节）
export function fieldsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')
    fields[key] ??= issue.message
  }
  return fields
}
