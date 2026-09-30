// 控制器绑定契约：@Route(contract.x) 注册路由并挂上契约；@Input() 按契约校验入参；@CurrentViewer() 取当前账号
import { appError, copy, fieldsOf, type Endpoint, type OutputOf } from '@huazhong/shared'
import {
  applyDecorators,
  createParamDecorator,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  SetMetadata,
} from '@nestjs/common'
import type { Request } from 'express'
import * as z from 'zod'
import type { Viewer } from './domain/viewer.ts'
import { requestContext } from './request-context.ts'

export const ENDPOINT_METADATA = Symbol('hz:endpoint')
export const IDEMPOTENCY_HEADER = 'x-idempotency-key'

const routeDecorators = { GET: Get, POST: Post, PUT: Put, PATCH: Patch, DELETE: Delete } as const

type Handler<E extends Endpoint> = (...args: never[]) => Promise<OutputOf<E>>

// 返回值类型必须等于契约的响应结构。成功一律 HTTP 200（00 章第 4 节；Nest 的 POST 默认是 201）
export function Route<E extends Endpoint>(endpoint: E) {
  const decorator = applyDecorators(
    routeDecorators[endpoint.method](endpoint.path),
    HttpCode(HttpStatus.OK),
    SetMetadata(ENDPOINT_METADATA, endpoint),
  )
  return decorator as <H extends Handler<E>>(
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<H>,
  ) => void
}

type Parsed<E, K extends string> =
  E extends Record<K, infer S extends z.ZodType> ? z.output<S> : undefined

export type ParsedInput<E extends Endpoint> = {
  params: Parsed<E, 'params'>
  query: Parsed<E, 'query'>
  body: Parsed<E, 'body'>
} & (E extends { idempotent: true } ? { idempotencyKey: string } : unknown)

interface RawInput {
  params: unknown
  query: unknown
  body: unknown
  idempotencyKey: string | undefined
}

const idempotencyKeySchema = z.uuid()

// 入参校验不过统一返回 VALIDATION_FAILED，fields 的键是字段路径（05 章第 1.4 节）
function parseInput<E extends Endpoint>(endpoint: E, raw: RawInput): ParsedInput<E> {
  const fields: Record<string, string> = {}
  const parsed: Record<string, unknown> = {}
  for (const part of ['params', 'query', 'body'] as const) {
    const schema = endpoint[part]
    if (!schema) continue
    const result = schema.safeParse(raw[part] ?? {})
    if (result.success) parsed[part] = result.data
    else Object.assign(fields, fieldsOf(result.error))
  }
  if (endpoint.idempotent) {
    const key = idempotencyKeySchema.safeParse(raw.idempotencyKey)
    if (key.success) parsed['idempotencyKey'] = key.data
    else fields[IDEMPOTENCY_HEADER] = copy.error.validationFallback
  }
  if (Object.keys(fields).length > 0) throw appError.validation(fields)
  return parsed as ParsedInput<E>
}

export const Input = createParamDecorator((_data: unknown, ctx) => {
  const endpoint = requestContext.get()?.endpoint
  if (!endpoint) throw appError.internal()
  const req = ctx.switchToHttp().getRequest<Request>()
  return parseInput(endpoint, {
    params: req.params,
    query: req.query,
    body: req.body as unknown,
    idempotencyKey: req.header(IDEMPOTENCY_HEADER),
  })
})

export const CurrentViewer = createParamDecorator((): Viewer => {
  const viewer = requestContext.get()?.viewer
  if (!viewer) throw appError.unauthenticated()
  return viewer
})
