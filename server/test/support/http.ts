// 接口测试发请求：走真实 HTTP，带云托管会注入的 X-WX-OPENID
import { API_PREFIX, type ErrorBody } from '@huazhong/shared'
import type { TestApp } from './app.ts'

export interface Envelope {
  ok: boolean
  data?: unknown
  error?: ErrorBody
}

export interface ApiResponse {
  status: number
  body: Envelope
  requestId: string | null
}

interface CallOptions {
  openid?: string
  body?: unknown
  // 原样发送的请求体（测非法 JSON）
  rawBody?: string
  idempotencyKey?: string
}

export async function call(
  t: TestApp,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.openid) headers['x-wx-openid'] = options.openid
  if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey
  const body = options.rawBody ?? (options.body === undefined ? null : JSON.stringify(options.body))
  const res = await fetch(`${t.baseUrl}${API_PREFIX}${path}`, { method, headers, body })
  return {
    status: res.status,
    body: (await res.json()) as Envelope,
    requestId: res.headers.get('x-request-id'),
  }
}
