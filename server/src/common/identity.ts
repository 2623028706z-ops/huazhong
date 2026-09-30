// 按 openid 查当前账号：HTTP 守卫和 WebSocket 握手共用（05 章第 1.2、12.1 节）。
// 绑定手机号按手机号查、退出登录按 openid 查（不看停用），也用同一个查询
import { appError, type ModuleKey } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import { accountModules, accounts, customers, stores, suppliers } from '../../db/schema/index.ts'
import { DB } from './db.ts'
import { resolveViewer, type AccountRow, type Viewer } from './domain/viewer.ts'

// 账号的员工模块（相关子查询，放在以 accounts 为主表的查询里）
function accountModulesOf(executor: Db | Tx): SQL<ModuleKey[]> {
  const list = executor
    .select({ list: sql<ModuleKey[]>`coalesce(array_agg(${accountModules.module}::text), '{}')` })
    .from(accountModules)
    .where(eq(accountModules.accountId, accounts.id))
  return sql<ModuleKey[]>`(${list})`
}

// 账号本身的列（不含门店、供应商归属）：身份查询和员工列表共用
export function accountColumns(executor: Db | Tx) {
  return {
    accountId: accounts.id,
    version: accounts.version,
    type: accounts.type,
    name: accounts.name,
    phone: accounts.phone,
    openid: accounts.openid,
    enabled: accounts.enabled,
    modules: accountModulesOf(executor),
  }
}

// 一个账号的身份、归属、模块。同一手机号有启用和停用的两条时先取启用的；forUpdate 只锁账号行
export async function findAccountRow(
  executor: Db | Tx,
  where: SQL,
  forUpdate = false,
): Promise<AccountRow | undefined> {
  const query = executor
    .select({
      ...accountColumns(executor),
      storeId: accounts.storeId,
      storeName: stores.name,
      storeEnabled: stores.enabled,
      customerId: stores.customerId,
      customerName: customers.name,
      supplierId: accounts.supplierId,
      supplierName: suppliers.name,
      supplierEnabled: suppliers.enabled,
    })
    .from(accounts)
    .leftJoin(stores, eq(stores.id, accounts.storeId))
    .leftJoin(customers, eq(customers.id, stores.customerId))
    .leftJoin(suppliers, eq(suppliers.id, accounts.supplierId))
    .where(where)
    .orderBy(desc(accounts.enabled), desc(accounts.id))
    .limit(1)
  const [row] = forUpdate ? await query.for('update', { of: accounts }) : await query
  return row
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolve(openid: string | undefined): Promise<Viewer> {
    if (!openid) throw appError.unauthenticated()
    return resolveViewer(await findAccountRow(this.db, eq(accounts.openid, openid)))
  }
}
