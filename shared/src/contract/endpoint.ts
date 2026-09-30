// 接口定义的结构：每个接口只定义一次（00 章第 2 节）
import type * as z from 'zod'
import type { ModuleKey } from '../enums.ts'
import type { ErrorCode } from '../errors.ts'

export const API_PREFIX = '/api/v1'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// 「谁」：模块码 = 有这个模块权限的员工（管理员默认全部模块）；
// staff = 任何员工和管理员；admin = 只有管理员；store、supplier = 门店、供应商账号
export type Grant = ModuleKey | 'staff' | 'admin' | 'store' | 'supplier'

export interface Endpoint {
  readonly method: HttpMethod
  readonly path: string
  // 允许的角色；'any' = 任何已绑定、启用的账号；
  // 'openid' = 只要云托管注入了 openid（可未绑定、可停用），绑定和退出登录用（05 章第 2 节）
  readonly grants: 'any' | 'openid' | readonly Grant[]
  readonly params?: z.ZodType
  readonly query?: z.ZodType
  readonly body?: z.ZodType
  readonly response: z.ZodType
  // 接口自己可能返回的错误码；公共层统一返回的（guardErrorCodes）不用重复写
  readonly errors: readonly ErrorCode[]
  // 新建类接口：要带 X-Idempotency-Key（05 章第 1.2 节）
  readonly idempotent?: true
}

type Part<E, K extends string> =
  E extends Record<K, infer S extends z.ZodType> ? z.input<S> : undefined

export interface InputOf<E extends Endpoint> {
  params: Part<E, 'params'>
  query: Part<E, 'query'>
  body: Part<E, 'body'>
}

export type OutputOf<E extends Endpoint> = z.output<E['response']>

// 公共层统一返回的错误码（身份守卫、入参校验、系统出错）：每个接口都可能返回
export const guardErrorCodes: readonly ErrorCode[] = [
  'UNAUTHENTICATED',
  'ACCOUNT_DISABLED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'INTERNAL',
]
