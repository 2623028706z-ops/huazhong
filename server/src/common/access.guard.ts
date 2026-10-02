// 权限第一层：身份（X-WX-OPENID）+ 契约里的「允许角色」（05 章第 1.2 节）。
// 第二层（数据归属）在 service 里按 viewer 过滤，查不到一律 NOT_FOUND（scope.ts）
import { appError, contract, type Endpoint } from '@huazhong/shared'
import { Injectable, Inject, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import * as z from 'zod'
import type { Db } from '../../db/client.ts'
import { idempotencyKeys, payments } from '../../db/schema/index.ts'
import { DB } from './db.ts'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { isGranted } from './domain/viewer.ts'
import { ENDPOINT_METADATA, IDEMPOTENCY_HEADER } from './endpoint.ts'
import { IdentityService } from './identity.ts'
import { requestContext } from './request-context.ts'

export const OPENID_HEADER = 'x-wx-openid'

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const endpoint = this.reflector.get<Endpoint | undefined>(ENDPOINT_METADATA, ctx.getHandler())
    // 每个路由都必须用 @Route(contract.x) 声明；漏了是代码错误，接口测试会拦住（test/contract.test.ts）
    if (!endpoint) throw appError.internal()
    const state = requestContext.get()
    if (!state) throw appError.internal()
    state.endpoint = endpoint
    const req = ctx.switchToHttp().getRequest<Request>()
    const openid = req.header(OPENID_HEADER)
    // 绑定、退出登录：只要有 openid，账号由接口自己按 openid 查（可未绑定、可停用）
    if (endpoint.grants === 'openid') {
      if (!openid) throw appError.unauthenticated()
      state.openid = openid
      return true
    }
    const viewer = await this.identity.resolve(openid)
    state.viewer = viewer
    if (!isGranted(viewer, endpoint.grants)) throw appError.forbidden()
    if (endpoint === contract.createPayment) {
      const replayId = await this.paymentReplayId(viewer.accountId, req.header(IDEMPOTENCY_HEADER))
      if (replayId !== undefined) state.paymentReplayId = replayId
    }
    return true
  }

  private async paymentReplayId(accountId: number, header: string | undefined) {
    const key = z.uuid().safeParse(header)
    if (!key.success) return undefined
    const [existing] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.accountId, accountId),
          eq(idempotencyKeys.key, key.data),
          eq(idempotencyKeys.endpoint, 'POST /finance/payments'),
        ),
      )
    const result = z
      .object({ id: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]) })
      .safeParse(existing?.response)
    if (!result.success) return undefined
    const [payment] = await this.db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, Number(result.data.id)), eq(payments.createdBy, accountId)))
    return payment?.id
  }
}
