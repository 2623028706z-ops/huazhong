// 权限第一层：身份（X-WX-OPENID）+ 契约里的「允许角色」（05 章第 1.2 节）。
// 第二层（数据归属）在 service 里按 viewer 过滤，查不到一律 NOT_FOUND（scope.ts）
import { appError, type Endpoint } from '@huazhong/shared'
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { isGranted } from './domain/viewer.ts'
import { ENDPOINT_METADATA } from './endpoint.ts'
import { IdentityService } from './identity.ts'
import { requestContext } from './request-context.ts'

export const OPENID_HEADER = 'x-wx-openid'

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
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
    return true
  }
}
