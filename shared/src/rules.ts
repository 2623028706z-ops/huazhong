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

// 必填的选择项（客户、门店、分类）：没选时写专门的提示
export function requiredIdSchema(message: string) {
  return z.string({ error: message }).regex(/^[1-9][0-9]*$/, { error: message })
}

// 必填的业务日期（出货日期等）
export function requiredDateSchema(message: string) {
  return z.iso.date({ error: message })
}

// 数量这类输入：大于 0 的整数（明细行数量、配方用量）
export function positiveIntSchema(message: string) {
  return z.number({ error: message }).int({ error: message }).positive({ error: message })
}

// 可以填 0 的整数（处理售后时不给的行填 0）
export function nonNegativeIntSchema(message: string) {
  return z.number({ error: message }).int({ error: message }).nonnegative({ error: message })
}

// 金额输入（分）：0 或正整数，没填时写专门的提示
export function centsInputSchema(message: string) {
  return nonNegativeIntSchema(message).max(Number.MAX_SAFE_INTEGER, { error: message })
}

// 必填的文字（名称、原因）：去掉首尾空白后不能为空
export function requiredTextSchema(message: string) {
  return z.string({ error: message }).trim().min(1, { error: message })
}

// 卡片第 2 行的总数：按单位合计，顺序照明细里第一次出现（format.formatUnitTotals 显示）
export const unitTotalSchema = z.object({ unit: z.string(), qty: z.number().int().nonnegative() })
export type UnitTotal = z.infer<typeof unitTotalSchema>

// Zod 的报错转成 VALIDATION_FAILED 的 fields：键是字段路径，明细行写 lines.0.qty（05 章第 1.4 节）
export function fieldsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')
    fields[key] ??= issue.message
  }
  return fields
}
