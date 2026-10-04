// 客户：列表（带门店）、新建、改名、启用 / 停用（05 章第 4 节主数据）
import { appError, contract, copy, type CustomerItem, type OutputOf } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { accounts, customers, stores } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { Clock } from '../../common/clock.ts'
import { customerOverdue, customerOverdues } from '../../common/statements.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { afterCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { toCustomerItem, type StoreRow } from './domain/store-view.ts'
import type { Executor } from './order-rows.ts'

const NAME_FIELDS = { customers_name_unique: { name: copy.catalog.customerNameTaken } }

const isSales = (viewer: Viewer) => viewer.modules.includes('sales')

// 门店 + 启用的门店账号（一个门店最多一个，accounts_one_per_store）
export async function storeRowsOf(
  executor: Executor,
  where: SQL,
  forUpdate = false,
): Promise<StoreRow[]> {
  const query = executor
    .select({
      id: stores.id,
      version: stores.version,
      customerId: stores.customerId,
      name: stores.name,
      contact: stores.contact,
      phone: stores.phone,
      address: stores.address,
      enabled: stores.enabled,
      accountId: accounts.id,
      accountVersion: accounts.version,
      loginPhone: accounts.phone,
      bound: sql<boolean>`${accounts.openid} IS NOT NULL`,
    })
    .from(stores)
    .leftJoin(
      accounts,
      and(eq(accounts.storeId, stores.id), eq(accounts.type, 'store'), eq(accounts.enabled, true)),
    )
    .where(where)
    .orderBy(asc(stores.id))
  return forUpdate ? query.for('update', { of: stores }) : query
}

function customerLog(row: { id: number; name: string }, action: string) {
  return {
    module: 'sales' as const,
    kind: copy.log.kind.customer,
    action,
    targetType: 'customers',
    targetId: row.id,
    targetLabel: row.name,
  }
}

function customerView(row: { name: string; enabled: boolean }): Record<string, string> {
  return {
    [copy.field.name]: row.name,
    [copy.field.status]: row.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}

async function assertNameFree(tx: Tx, name: string, exceptId: number | null): Promise<void> {
  const [taken] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(eq(customers.name, name), exceptId === null ? undefined : ne(customers.id, exceptId)),
    )
  if (taken) throw appError.validation({ name: copy.catalog.customerNameTaken })
}

@Injectable()
export class CustomerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
    private readonly clock: Clock,
  ) {}

  async item(executor: Executor, viewer: Viewer, id: number): Promise<CustomerItem> {
    const [row] = await executor.select().from(customers).where(eq(customers.id, id))
    const storeRows = await storeRowsOf(executor, eq(stores.customerId, id))
    return toCustomerItem(
      found(row),
      storeRows,
      isSales(viewer),
      await customerOverdue(executor, id, this.clock.today()),
    )
  }

  async list(
    viewer: Viewer,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<OutputOf<typeof contract.listCustomers>> {
    const rows = await this.db
      .select()
      .from(customers)
      .where(afterCursor(customers.id, customers.id, query.cursor))
      .orderBy(asc(customers.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.id, row.id])
    const ids = page.items.map((row) => row.id)
    const storeRows =
      ids.length === 0 ? [] : await storeRowsOf(this.db, inArray(stores.customerId, ids))
    const sales = isSales(viewer)
    const overdue = await customerOverdues(this.db, ids, this.clock.today())
    return {
      items: page.items.map((row) =>
        toCustomerItem(
          row,
          storeRows.filter((store) => store.customerId === row.id),
          sales,
          overdue.get(row.id) ?? null,
        ),
      ),
      nextCursor: page.nextCursor,
      actions: sales
        ? [actionOf('create', null, null), actionOf('createCustomer', null, null)]
        : [],
    }
  }

  create(
    viewer: Viewer,
    input: { name: string; enabled: boolean },
    idempotencyKey: string,
  ): Promise<CustomerItem> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await assertNameFree(ctx.tx, input.name, null)
            const [row] = await ctx.tx
              .insert(customers)
              .values({ ...input, createdBy: viewer.accountId })
              .returning()
            if (!row) throw appError.internal()
            await ctx.log({
              ...customerLog(row, copy.log.action.createCustomer),
              after: customerView(row),
            })
            return this.item(ctx.tx, viewer, row.id)
          },
          { endpoint: contract.createCustomer, key: idempotencyKey },
        ),
      NAME_FIELDS,
    )
  }

  // 停用的客户不能再下新单，门店账号照常登录；启用状态变了推 catalog（门店首页刷新）
  update(
    viewer: Viewer,
    id: number,
    input: { version: number; name: string; enabled: boolean },
  ): Promise<CustomerItem> {
    return guardUnique(
      () => this.writes.run(viewer, (ctx) => this.updateInTx(ctx, viewer, id, input)),
      NAME_FIELDS,
    )
  }

  private async updateInTx(
    ctx: WriteContext,
    viewer: Viewer,
    id: number,
    input: { version: number; name: string; enabled: boolean },
  ): Promise<CustomerItem> {
    const [row] = await ctx.tx.select().from(customers).where(eq(customers.id, id)).for('update')
    const before = found(row)
    if (before.version !== input.version) {
      throw appError.stale(copy.catalog.customerStale, await this.item(ctx.tx, viewer, id))
    }
    if (before.name === input.name && before.enabled === input.enabled) {
      throw appError.businessRule(copy.error.noChange)
    }
    if (before.name !== input.name) await assertNameFree(ctx.tx, input.name, id)
    await ctx.tx
      .update(customers)
      .set({ name: input.name, enabled: input.enabled, version: sql`${customers.version} + 1` })
      .where(eq(customers.id, id))
    await ctx.log({
      ...customerLog({ id, name: input.name }, copy.log.action.updateCustomer),
      before: customerView(before),
      after: customerView(input),
    })
    if (before.enabled !== input.enabled) {
      ctx.notify([{ topic: `catalog:${id}`, version: null }])
    }
    return this.item(ctx.tx, viewer, id)
  }
}
