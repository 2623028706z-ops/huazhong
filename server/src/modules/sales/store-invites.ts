// 门店邀请下单（05 章第 2、4 节）：销售生成、查看；门店打开链接后用手机号快速验证绑定到这家门店的账号。
// 同一门店同一时间只有一条待使用；库里只存 token 的哈希；「门店接受邀请」日志记在销售模块（阶段 3 确认）
import {
  appError,
  contract,
  copy,
  STORE_INVITE_TOKEN_BYTES,
  STORE_INVITE_TTL_DAYS,
  storeInvitePath,
  type Me,
  type OutputOf,
  type StoreInviteView,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { accounts, customers, storeInvites, stores } from '../../../db/schema/index.ts'
import { versionPlusOne } from '../../common/account-writes.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { hashToken, newToken } from '../../common/domain/token.ts'
import {
  actorLabelOf,
  resolveViewer,
  viewerOf,
  type AccountRow,
  type Viewer,
} from '../../common/domain/viewer.ts'
import { findAccountRow } from '../../common/identity.ts'
import { found } from '../../common/scope.ts'
import { WriteService } from '../../common/write.service.ts'
import { AccountsService } from '../accounts/accounts.service.ts'
import { lockStoreRow, storeLog } from './stores.ts'

const MS_PER_DAY = 86_400_000

type InviteStatus = StoreInviteView['status']

// 待使用但过了有效期的按 expires_at 现算成已过期
function statusOf(row: { status: InviteStatus; expiresAt: Date }, now: Date): InviteStatus {
  return row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status
}

async function inviteByToken(executor: Db | Tx, token: string, forUpdate = false) {
  const query = executor
    .select({
      id: storeInvites.id,
      storeId: storeInvites.storeId,
      status: storeInvites.status,
      expiresAt: storeInvites.expiresAt,
      storeName: stores.name,
      customerName: customers.name,
    })
    .from(storeInvites)
    .innerJoin(stores, eq(stores.id, storeInvites.storeId))
    .innerJoin(customers, eq(customers.id, stores.customerId))
    .where(eq(storeInvites.tokenHash, hashToken(token)))
  const [row] = forUpdate ? await query.for('update', { of: storeInvites }) : await query
  return found(row)
}

function isSelf(row: AccountRow, storeId: number): boolean {
  return row.type === 'store' && row.storeId === storeId
}

@Injectable()
export class StoreInviteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly accounts: AccountsService,
    private readonly clock: Clock,
  ) {}

  // 旧的待使用邀请作废，再生成新的；门店要启用、已开通门店账号、账号还没绑微信
  create(
    viewer: Viewer,
    storeId: number,
    idempotencyKey: string,
  ): Promise<OutputOf<typeof contract.createStoreInvite>> {
    return this.writes.run(
      viewer,
      async (ctx) => {
        const store = await lockStoreRow(ctx.tx, storeId)
        if (!store.enabled) throw appError.businessRule(copy.catalog.storeDisabledInvite)
        if (store.accountId === null) throw appError.businessRule(copy.catalog.loginPhoneMissing)
        if (store.bound) throw appError.businessRule(copy.catalog.storeBound)
        await ctx.tx
          .update(storeInvites)
          .set({ status: 'voided' })
          .where(and(eq(storeInvites.storeId, storeId), eq(storeInvites.status, 'pending')))
        const token = newToken(STORE_INVITE_TOKEN_BYTES)
        const expiresAt = new Date(this.clock.now().getTime() + STORE_INVITE_TTL_DAYS * MS_PER_DAY)
        const [row] = await ctx.tx
          .insert(storeInvites)
          .values({ storeId, tokenHash: hashToken(token), expiresAt, createdBy: viewer.accountId })
          .returning({ id: storeInvites.id })
        if (!row) throw appError.internal()
        await ctx.log(storeLog(store, copy.log.action.inviteStore))
        ctx.notify([{ topic: `store_invites:${storeId}`, version: null }])
        return {
          id: String(row.id),
          path: storeInvitePath(token),
          title: copy.invite.storeTitle,
          expiresAt: expiresAt.toISOString(),
        }
      },
      { endpoint: contract.createStoreInvite, key: idempotencyKey },
    )
  }

  async list(storeId: number): Promise<OutputOf<typeof contract.listStoreInvites>> {
    const [store] = await this.db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.id, storeId))
    found(store)
    const rows = await this.db
      .select()
      .from(storeInvites)
      .where(eq(storeInvites.storeId, storeId))
      .orderBy(desc(storeInvites.createdAt), desc(storeInvites.id))
    const now = this.clock.now()
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        status: statusOf(row, now),
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        boundAt: row.boundAt?.toISOString() ?? null,
      })),
      nextCursor: null,
      actions: [],
    }
  }

  // 任何 openid 都能打开（可未绑定）：显示是哪家门店，以及这台微信现在绑的是谁
  async view(openid: string, token: string): Promise<StoreInviteView> {
    const invite = await inviteByToken(this.db, token)
    const bound = await findAccountRow(this.db, eq(accounts.openid, openid))
    let binding: StoreInviteView['binding'] = 'none'
    if (bound) binding = isSelf(bound, invite.storeId) ? 'self' : 'other'
    return {
      storeLabel: copy.org.store(invite.customerName, invite.storeName),
      status: statusOf(invite, this.clock.now()),
      expiresAt: invite.expiresAt.toISOString(),
      binding,
      boundLabel: bound && binding === 'other' ? actorLabelOf(viewerOf(bound)) : null,
    }
  }

  // 已是这家门店的账号直接返回；绑了别的账号要先退出登录（不解绑、邀请不变）
  async use(openid: string, token: string, code: string): Promise<Me> {
    const invite = await inviteByToken(this.db, token)
    const bound = await findAccountRow(this.db, eq(accounts.openid, openid))
    if (bound && isSelf(bound, invite.storeId)) return this.accounts.me(resolveViewer(bound))
    if (bound) throw appError.businessRule(copy.invite.otherAccount(actorLabelOf(viewerOf(bound))))
    if (statusOf(invite, this.clock.now()) !== 'pending') {
      throw appError.businessRule(copy.invite.invalid)
    }
    const phone = await this.accounts.exchangePhone(code)
    const viewer = await this.writes.run(null, async (ctx) => {
      const locked = await inviteByToken(ctx.tx, token, true)
      if (statusOf(locked, this.clock.now()) !== 'pending') {
        throw appError.businessRule(copy.invite.invalid)
      }
      const row = await findAccountRow(
        ctx.tx,
        sql`${eq(accounts.storeId, locked.storeId)} AND ${eq(accounts.type, 'store')} AND ${eq(accounts.enabled, true)}`,
        true,
      )
      if (!row) throw appError.businessRule(copy.invite.invalid)
      const account = resolveViewer(row)
      if (row.phone !== phone) throw appError.businessRule(copy.invite.phoneMismatch)
      if (row.openid !== null) throw appError.businessRule(copy.catalog.storeBound)
      const now = this.clock.now()
      await ctx.tx
        .update(accounts)
        .set({ openid, boundAt: now, version: versionPlusOne })
        .where(eq(accounts.id, row.accountId))
      await ctx.tx
        .update(storeInvites)
        .set({ status: 'used', boundAccountId: row.accountId, boundAt: now })
        .where(eq(storeInvites.id, locked.id))
      await ctx.log({
        ...storeLog({ id: locked.storeId, name: locked.storeName }, copy.log.action.acceptInvite),
        actor: account,
      })
      ctx.notify([{ topic: `store_invites:${locked.storeId}`, version: null }])
      return account
    })
    return this.accounts.me(viewer)
  }
}
