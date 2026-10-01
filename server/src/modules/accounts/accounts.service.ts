// 当前账号、手机号快速验证绑定、退出登录（05 章第 2 节）
import { appError, copy, type Me } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { accounts } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { resolveViewer, viewerOf, type Viewer } from '../../common/domain/viewer.ts'
import { findAccountRow } from '../../common/identity.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { clearBinding, versionPlusOne } from '../../common/account-writes.ts'
import { accountLog } from './binding.ts'
import { landingOf, menusOf } from './domain/me.ts'
import { PhoneExchange } from './phone.ts'

const idOrNull = (id: number | null) => (id === null ? null : String(id))

@Injectable()
export class AccountsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly phones: PhoneExchange,
  ) {}

  me(viewer: Viewer): Me {
    return {
      id: String(viewer.accountId),
      type: viewer.type,
      name: viewer.name,
      phone: viewer.phone,
      orgLabel: viewer.orgLabel,
      storeId: idOrNull(viewer.storeId),
      supplierId: idOrNull(viewer.supplierId),
      modules: [...viewer.modules],
      landing: landingOf(viewer),
      menus: menusOf(viewer),
    }
  }

  // 手机号快速验证的令牌换手机号：门店邀请（sales 模块）也用
  exchangePhone(code: string): Promise<string> {
    return this.phones.exchange(code)
  }

  // 已绑定就直接返回当前账号（停用照常报 ACCOUNT_DISABLED）；否则换手机号、对上启用的预录账号后绑定
  async bindPhone(openid: string, code: string): Promise<Me> {
    const bound = await findAccountRow(this.db, eq(accounts.openid, openid))
    if (bound) return this.me(resolveViewer(bound))
    const phone = await this.phones.exchange(code)
    const viewer = await this.writes.run(null, (ctx) => this.bindInTx(ctx, openid, phone))
    return this.me(viewer)
  }

  private async bindInTx(ctx: WriteContext, openid: string, phone: string): Promise<Viewer> {
    const row = await findAccountRow(ctx.tx, eq(accounts.phone, phone), true)
    if (!row) throw appError.businessRule(copy.auth.phoneNotRegistered)
    const viewer = resolveViewer(row)
    if (row.openid !== null && row.openid !== openid) {
      throw appError.businessRule(copy.auth.boundToOtherWechat)
    }
    await ctx.tx
      .update(accounts)
      .set({ openid, boundAt: new Date(), version: versionPlusOne })
      .where(eq(accounts.id, row.accountId))
    await ctx.log({ ...accountLog(row, copy.log.bind), actor: viewer })
    return viewer
  }

  // 退出登录 = 解绑这台微信；停用的账号也能退出，没绑账号直接返回
  async unbind(openid: string): Promise<Record<string, never>> {
    await this.writes.run(null, async (ctx) => {
      const row = await findAccountRow(ctx.tx, eq(accounts.openid, openid), true)
      if (!row) {
        ctx.unchanged()
        return
      }
      await clearBinding(ctx.tx, row.accountId)
      await ctx.log({ ...accountLog(row, copy.log.unbind), actor: viewerOf(row) })
      ctx.notify([{ topic: `account:${row.accountId}`, version: null }])
    })
    return {}
  }
}
