// 门店和门店账号（05 章第 4 节主数据）：同一事务写 accounts；门店账号的名字就是联系人
import {
  appError,
  contract,
  copy,
  type StoreCreate,
  type StoreItem,
  type StoreUpdate,
} from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import { accounts, customers, stores } from '../../../db/schema/index.ts'
import {
  assertPhoneFree,
  clearBinding,
  ENABLED_PHONE_INDEX,
  versionPlusOne,
} from '../../common/account-writes.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { storeRowsOf } from './customers.ts'
import {
  accountPlanOf,
  storeLogView,
  storeStateOf,
  toStoreItem,
  type StoreRow,
  type StoreState,
} from './domain/store-view.ts'

const UNIQUE_FIELDS = {
  stores_customerId_name_unique: { name: copy.catalog.storeNameTaken },
  [ENABLED_PHONE_INDEX]: { loginPhone: copy.catalog.loginPhoneTaken },
}

export function storeLog(row: { id: number; name: string }, action: string) {
  return {
    module: 'sales' as const,
    kind: copy.log.kind.store,
    action,
    targetType: 'stores',
    targetId: row.id,
    targetLabel: row.name,
  }
}

async function assertNameFree(tx: Tx, customerId: number, name: string, exceptId: number | null) {
  const [taken] = await tx
    .select({ id: stores.id })
    .from(stores)
    .where(
      and(
        eq(stores.customerId, customerId),
        eq(stores.name, name),
        exceptId === null ? undefined : ne(stores.id, exceptId),
      ),
    )
  if (taken) throw appError.validation({ name: copy.catalog.storeNameTaken })
}

export async function lockStoreRow(tx: Tx, id: number): Promise<StoreRow> {
  return found((await storeRowsOf(tx, eq(stores.id, id), true))[0])
}

function sameState(a: StoreState, b: StoreState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

@Injectable()
export class StoreWrites {
  constructor(private readonly writes: WriteService) {}

  private async item(tx: Tx, id: number): Promise<StoreItem> {
    return toStoreItem(found((await storeRowsOf(tx, eq(stores.id, id)))[0]), true)
  }

  create(viewer: Viewer, input: StoreCreate, idempotencyKey: string): Promise<StoreItem> {
    const { customerId, loginPhone, ...fields } = input
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            const [customer] = await ctx.tx
              .select({ id: customers.id })
              .from(customers)
              .where(eq(customers.id, Number(customerId)))
            found(customer)
            await assertNameFree(ctx.tx, Number(customerId), input.name, null)
            const [row] = await ctx.tx
              .insert(stores)
              .values({ ...fields, customerId: Number(customerId), createdBy: viewer.accountId })
              .returning({ id: stores.id })
            if (!row) throw appError.internal()
            if (loginPhone !== '') {
              await assertPhoneFree(ctx.tx, loginPhone, null, 'loginPhone')
              await this.insertAccount(ctx, row.id, input)
            }
            await ctx.log({
              ...storeLog({ id: row.id, name: input.name }, copy.log.action.createStore),
              after: storeLogView(input),
            })
            return this.item(ctx.tx, row.id)
          },
          { endpoint: contract.createStore, key: idempotencyKey },
        ),
      UNIQUE_FIELDS,
    )
  }

  private async insertAccount(ctx: WriteContext, storeId: number, state: StoreState) {
    await ctx.tx.insert(accounts).values({
      type: 'store',
      name: state.contact,
      phone: state.loginPhone,
      storeId,
      createdBy: ctx.viewer?.accountId ?? 0,
    })
  }

  update(viewer: Viewer, id: number, input: StoreUpdate): Promise<StoreItem> {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.updateInTx(ctx, id, input)),
      UNIQUE_FIELDS,
    )
  }

  private async updateInTx(ctx: WriteContext, id: number, input: StoreUpdate): Promise<StoreItem> {
    const row = await lockStoreRow(ctx.tx, id)
    if (row.version !== input.version) {
      throw appError.stale(copy.catalog.storeStale, toStoreItem(row, true))
    }
    const before = storeStateOf(row)
    const next: StoreState = {
      name: input.name,
      contact: input.contact,
      phone: input.phone,
      address: input.address,
      enabled: input.enabled,
      loginPhone: input.loginPhone,
    }
    if (sameState(before, next)) throw appError.businessRule(copy.error.noChange)
    if (before.name !== next.name) await assertNameFree(ctx.tx, row.customerId, next.name, id)
    const unbinding = await this.applyAccount(ctx, row, before, next)
    await ctx.tx
      .update(stores)
      .set({
        name: next.name,
        contact: next.contact,
        phone: next.phone,
        address: next.address,
        enabled: next.enabled,
        version: sql`${stores.version} + 1`,
      })
      .where(eq(stores.id, id))
    await ctx.log({
      ...storeLog({ id, name: next.name }, copy.log.action.updateStore),
      reason: unbinding ? copy.staff.unbindTogether : '',
      before: storeLogView(before),
      after: storeLogView(next),
    })
    // 门店停用、账号停用或改号解绑：对方的连接要断开
    if (row.accountId !== null && (unbinding || before.enabled !== next.enabled)) {
      ctx.notify([{ topic: `account:${row.accountId}`, version: null }])
    }
    return this.item(ctx.tx, id)
  }

  // 返回是否同时解绑了微信
  private async applyAccount(
    ctx: WriteContext,
    row: StoreRow,
    before: StoreState,
    next: StoreState,
  ): Promise<boolean> {
    const plan = accountPlanOf(before, next, row.accountId !== null)
    if (plan.kind === 'none') return false
    if (plan.kind === 'create') {
      await assertPhoneFree(ctx.tx, next.loginPhone, null, 'loginPhone')
      await this.insertAccount(ctx, row.id, next)
      return false
    }
    const accountId = row.accountId ?? 0
    if (plan.kind === 'disable') {
      await ctx.tx
        .update(accounts)
        .set({ enabled: false, openid: null, boundAt: null, version: versionPlusOne })
        .where(eq(accounts.id, accountId))
      return row.bound
    }
    if (plan.unbind) await assertPhoneFree(ctx.tx, next.loginPhone, accountId, 'loginPhone')
    await ctx.tx
      .update(accounts)
      .set({
        name: next.contact,
        phone: next.loginPhone,
        version: versionPlusOne,
        ...(plan.unbind ? { openid: null, boundAt: null } : {}),
      })
      .where(eq(accounts.id, accountId))
    return plan.unbind && row.bound
  }

  // 销售或管理员在门店资料里解绑：对方下次打开要重新手机号验证
  unbindWechat(viewer: Viewer, id: number, version: number): Promise<StoreItem> {
    return this.writes.run(viewer, async (ctx) => {
      const row = await lockStoreRow(ctx.tx, id)
      if (row.accountId === null || !row.bound) {
        throw appError.businessRule(copy.catalog.storeNotBound)
      }
      await ctx.tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, row.accountId))
        .for('update')
      if (row.accountVersion !== version) {
        throw appError.stale(copy.catalog.storeStale, toStoreItem(row, true))
      }
      await clearBinding(ctx.tx, row.accountId)
      await ctx.log(storeLog(row, copy.log.action.unbindStore))
      ctx.notify([{ topic: `account:${row.accountId}`, version: null }])
      return this.item(ctx.tx, id)
    })
  }
}
