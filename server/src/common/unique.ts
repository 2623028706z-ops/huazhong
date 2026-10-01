// 唯一约束兜底：先查重给出字段提示；并发写入时由数据库唯一约束拦下，这里转成同一个 VALIDATION_FAILED
import { appError } from '@huazhong/shared'

const UNIQUE_VIOLATION = '23505'

function violatedConstraint(error: unknown): string | null {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    const pgError = e as Error & { code?: string; constraint?: string }
    if (pgError.code === UNIQUE_VIOLATION) return pgError.constraint ?? null
  }
  return null
}

// fieldsByConstraint：约束名 → 报错字段（例如 customers_name_unique → { name: '已有同名客户' }）
export async function guardUnique<T>(
  work: () => Promise<T>,
  fieldsByConstraint: Readonly<Record<string, Record<string, string>>>,
): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const constraint = violatedConstraint(error)
    const fields = constraint === null ? undefined : fieldsByConstraint[constraint]
    if (fields) throw appError.validation(fields)
    throw error
  }
}
