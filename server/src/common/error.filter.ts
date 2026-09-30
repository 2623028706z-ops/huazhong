// 所有异常统一转成 { ok: false, error: { code, message, fields, latest } }（00 章第 4 节）。
// 业务代码只抛 AppError；其他异常一律 INTERNAL，记日志，不把堆栈返回给前端
import {
  AppError,
  appError,
  copy,
  guardErrorCodes,
  httpStatusOf,
  type ErrorBody,
} from '@huazhong/shared'
import {
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Response } from 'express'
import { ENV, type Env } from '../env.ts'
import { logger } from './logger.ts'
import { requestContext } from './request-context.ts'

// Nest、Express 自己抛的 HTTP 异常：没有这个路由 → NOT_FOUND；请求体不是合法 JSON、太大 → VALIDATION_FAILED
const invalidBody = () => appError.validation({ '': copy.error.validationFallback })
const nestHttpErrors = new Map<number, () => AppError>([
  [HttpStatus.NOT_FOUND, () => appError.notFound()],
  [HttpStatus.BAD_REQUEST, invalidBody],
  [HttpStatus.PAYLOAD_TOO_LARGE, invalidBody],
])

@Catch()
export class ErrorFilter implements ExceptionFilter {
  constructor(@Inject(ENV) private readonly env: Env) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception)
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(httpStatusOf[body.code])
      .json({ ok: false, error: body })
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppError) return this.checked(exception).toBody()
    if (exception instanceof HttpException) {
      const fallback = nestHttpErrors.get(exception.getStatus())
      if (fallback) return fallback().toBody()
    }
    logger.error('unhandled', {
      error: exception instanceof Error ? exception.stack : String(exception),
    })
    return appError.internal().toBody()
  }

  // 测试环境：接口返回了契约没声明的错误码，当成代码错误让测试失败
  private checked(error: AppError): AppError {
    const endpoint = requestContext.get()?.endpoint
    if (this.env.NODE_ENV !== 'test' || !endpoint) return error
    if (guardErrorCodes.includes(error.code) || endpoint.errors.includes(error.code)) return error
    logger.error('undeclared error code', {
      code: error.code,
      endpoint: `${endpoint.method} ${endpoint.path}`,
    })
    return appError.internal()
  }
}
