// 员工与岗位（05 章第 3 节）：只有管理员能用；日志都是公共
import {
  appError,
  contract,
  copy,
  type OutputOf,
  type StaffCreate,
  type StaffItem,
  type StaffUpdate,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { accountModules, accounts } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { accountColumns, findAccountRow } from '../../common/identity.ts'
import { afterCursor } from '../../common/page.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import {
  assertPhoneFree,
  clearBinding,
  ENABLED_PHONE_INDEX,
  versionPlusOne,
} from '../../common/account-writes.ts'
import { guardUnique } from '../../common/unique.ts'
import { accountLog } from './binding.ts'
import {
  isSameState,
  losesAdmin,
  needsUnbind,
  nextStateOf,
  stateOf,
  staffView,
  toStaffItem,
  type StaffRow,
  type StaffState,
} from './domain/staff.ts'

const STAFF_TYPES = ['admin', 'staff'] as const
// 并发新增同一个手机号时，部分唯一索引兜底（04 章第 3.1 节）
const PHONE_FIELDS = { [ENABLED_PHONE_INDEX]: { phone: copy.staff.phoneTaken } }

@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
  ) {}

  async list(query: {
    cursor?: string | undefined
    limit: number
  }): Promise<OutputOf<typeof contract.listStaff>> {
    const rows: StaffRow[] = await this.db
      .select(accountColumns(this.db))
      .from(accounts)
      .where(
        and(
          inArray(accounts.type, STAFF_TYPES),
          afterCursor(accounts.id, accounts.id, query.cursor),
        ),
      )
      .orderBy(asc(accounts.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.accountId, row.accountId])
    return {
      items: page.items.map(toStaffItem),
      nextCursor: page.nextCursor,
      actions: [enabledAction('create', null)],
    }
  }

  create(viewer: Viewer, input: StaffCreate, idempotencyKey: string): Promise<StaffItem> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await assertPhoneFree(ctx.tx, input.phone, null, 'phone')
            const [row] = await ctx.tx
              .insert(accounts)
              .values({
                type: input.admin ? 'admin' : 'staff',
                name: input.name,
                phone: input.phone,
                createdBy: viewer.accountId,
              })
              .returning({ id: accounts.id })
            if (!row) throw appError.internal()
            await saveModules(ctx.tx, row.id, input)
            const saved = await this.lock(ctx.tx, row.id)
            await ctx.log({
              ...accountLog(saved, copy.log.createStaff),
              after: staffView(stateOf(saved)),
            })
            return toStaffItem(saved)
          },
          { endpoint: contract.createStaff, key: idempotencyKey },
        ),
      PHONE_FIELDS,
    )
  }

  update(viewer: Viewer, id: number, input: StaffUpdate): Promise<StaffItem> {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.updateInTx(ctx, id, input)),
      PHONE_FIELDS,
    )
  }

  private async updateInTx(ctx: WriteContext, id: number, input: StaffUpdate): Promise<StaffItem> {
    const row = await this.lock(ctx.tx, id)
    if (row.version !== input.version) throw appError.stale(copy.staff.stale, toStaffItem(row))
    const before = stateOf(row)
    const next = nextStateOf(input)
    if (isSameState(before, next)) throw appError.businessRule(copy.error.noChange)
    await this.assertRules(ctx.tx, row, before, next)
    const unbinding = needsUnbind(before, next, row.openid !== null)
    await ctx.tx
      .update(accounts)
      .set({
        type: next.admin ? 'admin' : 'staff',
        name: next.name,
        phone: next.phone,
        enabled: next.enabled,
        version: versionPlusOne,
        ...(unbinding ? { openid: null, boundAt: null } : {}),
      })
      .where(eq(accounts.id, id))
    await saveModules(ctx.tx, id, next)
    const saved = await this.lock(ctx.tx, id)
    await ctx.log({
      ...accountLog(saved, copy.log.updateStaff),
      reason: unbinding ? copy.staff.unbindTogether : '',
      before: staffView(before),
      after: staffView(next),
    })
    ctx.notify([{ topic: `account:${id}`, version: saved.version }])
    return toStaffItem(saved)
  }

  // 最后一个启用的管理员不能降级、停用；启用状态下手机号不能和别的启用账号重复
  private async assertRules(tx: Tx, row: StaffRow, before: StaffState, next: StaffState) {
    if (losesAdmin(before, next)) {
      const others = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.type, 'admin'),
            eq(accounts.enabled, true),
            ne(accounts.id, row.accountId),
          ),
        )
        .orderBy(asc(accounts.id))
        .for('update')
      if (others.length === 0) throw appError.businessRule(copy.staff.lastAdmin)
    }
    const phoneMatters = next.enabled && (before.phone !== next.phone || !before.enabled)
    if (phoneMatters) await assertPhoneFree(tx, next.phone, row.accountId, 'phone')
  }

  // 管理员解绑员工的微信：对方下次打开要重新手机号验证
  unbindWechat(viewer: Viewer, id: number, version: number): Promise<StaffItem> {
    return this.writes.run(viewer, async (ctx) => {
      const row = await this.lock(ctx.tx, id)
      if (row.openid === null) throw appError.stale(copy.staff.notBound, toStaffItem(row))
      if (row.version !== version) throw appError.stale(copy.staff.stale, toStaffItem(row))
      await clearBinding(ctx.tx, id)
      const saved = await this.lock(ctx.tx, id)
      await ctx.log(accountLog(saved, copy.log.unbind))
      ctx.notify([{ topic: `account:${id}`, version: saved.version }])
      return toStaffItem(saved)
    })
  }

  // 只锁员工和管理员；门店、供应商账号的 id 当成找不到
  private async lock(tx: Tx, id: number) {
    const row = await findAccountRow(
      tx,
      sql`${eq(accounts.id, id)} AND ${inArray(accounts.type, STAFF_TYPES)}`,
      true,
    )
    if (!row) throw appError.notFound()
    return row
  }
}

// 员工模块整组替换；管理员不写（默认全部模块）
async function saveModules(
  tx: Tx,
  accountId: number,
  state: Pick<StaffState, 'admin' | 'modules'>,
): Promise<void> {
  await tx.delete(accountModules).where(eq(accountModules.accountId, accountId))
  if (state.admin || state.modules.length === 0) return
  await tx.insert(accountModules).values(state.modules.map((module) => ({ accountId, module })))
}
