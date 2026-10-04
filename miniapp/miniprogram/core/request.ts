// 请求层：所有接口只从这里调（00 章第 6 节、01 章第 3.2 节）。
// 路径、方法、要不要幂等键只来自契约；参数和返回值的类型从契约推出来，页面不写路径和类型。
import {
  API_PREFIX,
  READ_RETRY_COUNT,
  REQUEST_TIMEOUT_MS,
  copy,
  errorBodySchema,
  type Endpoint,
  type ErrorBody,
  type InputOf,
  type OutputOf,
} from '@huazhong/shared'
import { cloudTarget } from './config'

export type Failure =
  ({ kind: 'server'; requestId: string | null } & ErrorBody) | { kind: 'network' }

export type Result<T> = { ok: true; data: T } | { ok: false; failure: Failure }

// 只留契约里真有的输入部分：GET /me 这类没有输入的接口不用传参数
type Input<E extends Endpoint> = {
  [K in keyof InputOf<E> as InputOf<E>[K] extends undefined ? never : K]: InputOf<E>[K]
}
// 元组不写成员名（[options: …]）：开发者工具的编译器不认，整个文件会被丢掉（eslint 已拦）
type Options<E extends Endpoint> = E extends { idempotent: true }
  ? [{ idempotencyKey: string }]
  : []
type Args<E extends Endpoint> = keyof Input<E> extends never
  ? Options<E>
  : [Input<E>, ...Options<E>]

interface RawInput {
  params?: Record<string, string>
  query?: Record<string, unknown>
  body?: unknown
}

interface RawResponse {
  statusCode: number
  data: unknown
  header: Record<string, unknown>
}

const REQUEST_ID_HEADER = 'x-request-id'
const HEX = 16
const UUID_TEMPLATE = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
// UUID v4 的 variant 位：y 取 8、9、a、b
const VARIANT_MASK = 0x3
const VARIANT_BITS = 0x8

// 新建类表单每次打开生成一个幂等键（05 章第 1.2 节）；小程序没有 crypto.randomUUID
export function newIdempotencyKey(): string {
  return UUID_TEMPLATE.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * HEX)
    const value = char === 'x' ? random : (random & VARIANT_MASK) | VARIANT_BITS
    return value.toString(HEX)
  })
}
const inFlightWrites = new Map<string, Promise<Result<unknown>>>()

function buildPath(endpoint: Endpoint, input: RawInput): string {
  const path = endpoint.path.replace(/:([A-Za-z]+)/g, (_, name: string) =>
    encodeURIComponent(input.params?.[name] ?? ''),
  )
  const query = Object.entries(input.query ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return API_PREFIX + path + (query ? `?${query}` : '')
}

function callOnce(method: string, path: string, body: unknown, header: Record<string, string>) {
  const target = cloudTarget()
  return new Promise<RawResponse | null>((resolve) => {
    wx.cloud.callContainer({
      config: { env: target.env },
      path,
      method,
      header: { 'X-WX-SERVICE': target.service, ...header },
      data: body,
      timeout: REQUEST_TIMEOUT_MS,
      success: (response) => {
        resolve({ statusCode: response.statusCode, data: response.data, header: response.header })
      },
      // 断网、超时：交给界面按「网络不太好」处理（02 章第 5.2 节）；真实原因记进实时日志，真机排查用
      fail: (error) => {
        wx.getRealtimeLogManager().warn('callContainer', method, path, error.errMsg)
        resolve(null)
      },
    })
  })
}

function requestIdOf(header: Record<string, unknown>): string | null {
  const entry = Object.entries(header).find(([key]) => key.toLowerCase() === REQUEST_ID_HEADER)
  return typeof entry?.[1] === 'string' ? entry[1] : null
}

function parseResponse<T>(response: RawResponse | null): Result<T> {
  if (!response) return { ok: false, failure: { kind: 'network' } }
  const requestId = requestIdOf(response.header)
  const envelope = response.data as { ok?: unknown; data?: unknown; error?: unknown } | null
  if (envelope?.ok === true) return { ok: true, data: envelope.data as T }
  const parsed = errorBodySchema.safeParse(envelope?.error)
  // 不是花众的错误格式（例如网关直接返回的 5xx 页面）也按系统出错处理
  const body: ErrorBody = parsed.success
    ? parsed.data
    : { code: 'INTERNAL', message: copy.error.internal, fields: null, latest: null }
  return { ok: false, failure: { kind: 'server', requestId, ...body } }
}

async function send<T>(
  method: string,
  path: string,
  body: unknown,
  header: Record<string, string>,
) {
  const attempts = method === 'GET' ? READ_RETRY_COUNT + 1 : 1
  let response: RawResponse | null = null
  for (let attempt = 0; attempt < attempts && !response; attempt += 1) {
    response = await callOnce(method, path, body, header)
  }
  return parseResponse<T>(response)
}

export function request<E extends Endpoint>(
  endpoint: E,
  ...args: Args<E>
): Promise<Result<OutputOf<E>>> {
  const hasInput = 'params' in endpoint || 'query' in endpoint || 'body' in endpoint
  const input = (hasInput ? args[0] : {}) as RawInput
  const options = args[hasInput ? 1 : 0] as { idempotencyKey: string } | undefined
  const path = buildPath(endpoint, input)
  const header: Record<string, string> = options
    ? { 'X-Idempotency-Key': options.idempotencyKey }
    : {}
  if (endpoint.method === 'GET') return send(endpoint.method, path, undefined, header)
  // 同一个写请求还没回来时再次提交，直接复用这一次（防重复提交）
  const key = `${endpoint.method} ${path} ${JSON.stringify(input.body ?? null)}`
  const pending = inFlightWrites.get(key)
  if (pending) return pending as Promise<Result<OutputOf<E>>>
  const sending = send<OutputOf<E>>(endpoint.method, path, input.body, header).finally(() => {
    inFlightWrites.delete(key)
  })
  inFlightWrites.set(key, sending)
  return sending
}

// 并行取几个接口：第一个失败的原因（都成功为 null）
export function firstFailure(results: readonly Result<unknown>[]): Failure | null {
  for (const result of results) if (!result.ok) return result.failure
  return null
}
