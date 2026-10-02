// 错误码、HTTP 状态、默认文案：前后端引用同一份（00 章第 4 节）
import * as z from 'zod'
import { copy } from './copy.ts'

export const errorCodes = [
  'UNAUTHENTICATED',
  'ACCOUNT_DISABLED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'STALE',
  'BUSINESS_RULE',
  'INTERNAL',
] as const
export type ErrorCode = (typeof errorCodes)[number]

export const httpStatusOf: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  ACCOUNT_DISABLED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  STALE: 409,
  BUSINESS_RULE: 409,
  INTERNAL: 500,
}

export const errorBodySchema = z.object({
  code: z.enum(errorCodes),
  message: z.string(),
  fields: z.record(z.string(), z.string()).nullable(),
  latest: z.unknown(),
})
export type ErrorBody = z.infer<typeof errorBodySchema>

interface AppErrorInit {
  code: ErrorCode
  message: string
  fields?: Record<string, string>
  latest?: unknown
}

// 业务代码只抛这一种错误，公共层转成 { ok: false, error }（00 章第 11.4 节）
export class AppError extends Error {
  readonly code: ErrorCode
  readonly fields: Record<string, string> | null
  readonly latest: unknown

  constructor(init: AppErrorInit) {
    super(init.message)
    this.name = 'AppError'
    this.code = init.code
    this.fields = init.fields ?? null
    this.latest = init.latest ?? null
  }

  toBody(): ErrorBody {
    return { code: this.code, message: this.message, fields: this.fields, latest: this.latest }
  }
}

// 常用错误。STALE、BUSINESS_RULE 的句子跟着具体场景，必须由调用处给
export const appError = {
  unauthenticated: () =>
    new AppError({ code: 'UNAUTHENTICATED', message: copy.error.unauthenticated }),
  accountDisabled: (message: string = copy.error.accountDisabled) =>
    new AppError({ code: 'ACCOUNT_DISABLED', message }),
  forbidden: (message: string = copy.error.forbidden) =>
    new AppError({ code: 'FORBIDDEN', message }),
  notFound: () => new AppError({ code: 'NOT_FOUND', message: copy.error.notFound }),
  validation: (fields: Record<string, string>) =>
    new AppError({
      code: 'VALIDATION_FAILED',
      message: Object.values(fields)[0] ?? copy.error.validationFallback,
      fields,
    }),
  stale: (message: string, latest: unknown) => new AppError({ code: 'STALE', message, latest }),
  businessRule: (message: string) => new AppError({ code: 'BUSINESS_RULE', message }),
  internal: () => new AppError({ code: 'INTERNAL', message: copy.error.internal }),
}
