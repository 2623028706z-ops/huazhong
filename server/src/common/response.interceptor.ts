// 成功响应统一包成 { ok: true, data }；测试环境按契约的响应结构校验出参（05 章第 1.1 节）
import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import { map, type Observable } from 'rxjs'
import { ENV, type Env } from '../env.ts'
import { requestContext } from './request-context.ts'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  constructor(@Inject(ENV) private readonly env: Env) {}

  intercept(
    _ctx: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<{ ok: true; data: unknown }> {
    return next.handle().pipe(
      map((data) => {
        if (this.env.NODE_ENV === 'test') this.assertMatchesContract(data)
        return { ok: true as const, data }
      }),
    )
  }

  // 结构不对、或带了契约外的字段（parse 会去掉），都让测试失败
  private assertMatchesContract(data: unknown): void {
    const endpoint = requestContext.get()?.endpoint
    if (!endpoint) throw new Error('response without contract endpoint')
    const result = endpoint.response.safeParse(data)
    if (!result.success) {
      throw new Error(
        `response does not match contract ${endpoint.method} ${endpoint.path}: ${result.error.message}`,
      )
    }
    if (JSON.stringify(result.data) !== JSON.stringify(data)) {
      throw new Error(`response has fields outside contract ${endpoint.method} ${endpoint.path}`)
    }
  }
}
