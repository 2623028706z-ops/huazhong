// 每个请求的上下文：请求 ID、当前账号、命中的契约接口。日志、异常过滤器、参数装饰器都从这里取
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { Endpoint } from '@huazhong/shared'
import type { NextFunction, Request, Response } from 'express'
import type { Viewer } from './domain/viewer.ts'
import { logger } from './logger.ts'

const REQUEST_ID_HEADER = 'X-Request-Id'

interface RequestState {
  readonly requestId: string
  viewer: Viewer | null
  endpoint: Endpoint | null
}

const storage = new AsyncLocalStorage<RequestState>()

export const requestContext = {
  get(): RequestState | undefined {
    return storage.getStore()
  },
}

// 每个请求一个新的请求 ID，写进响应头；请求结束记一行日志（不记 query，避免记下搜索词）
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const state: RequestState = { requestId: randomUUID(), viewer: null, endpoint: null }
  const startedAt = performance.now()
  res.setHeader(REQUEST_ID_HEADER, state.requestId)
  res.on('finish', () => {
    storage.run(state, () => {
      logger.info('request', {
        method: req.method,
        route: state.endpoint?.path ?? null,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        accountId: state.viewer?.accountId ?? null,
      })
    })
  })
  storage.run(state, next)
}
