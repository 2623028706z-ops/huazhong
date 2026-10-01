// 表单即时校验的结果（00 章第 1 节）：和后端同一份 Zod 规则，报错换成 fields（键是 lines.0.qty 这种路径）
import { fieldsOf } from '@huazhong/shared'

export type Checked<T> = { ok: true; body: T } | { ok: false; fields: Record<string, string> }

type Parsed<T> =
  { success: true; data: T } | { success: false; error: Parameters<typeof fieldsOf>[0] }

export function checkedOf<T>(parsed: Parsed<T>): Checked<T> {
  return parsed.success
    ? { ok: true, body: parsed.data }
    : { ok: false, fields: fieldsOf(parsed.error) }
}
