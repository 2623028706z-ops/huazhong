// 按 openid 查当前账号：HTTP 守卫和 WebSocket 握手共用（05 章第 1.2、12.1 节）
import { appError, type ModuleKey } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client.ts'
import { accountModules, accounts, customers, stores, suppliers } from '../../db/schema/index.ts'
import { DB } from './db.ts'
import { resolveViewer, type AccountRow, type Viewer } from './domain/viewer.ts'

@Injectable()
export class IdentityService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async resolve(openid: string | undefined): Promise<Viewer> {
    if (!openid) throw appError.unauthenticated()
    return resolveViewer(await this.findByOpenid(openid))
  }

  private async findByOpenid(openid: string): Promise<AccountRow | undefined> {
    const modules = this.db
      .select({ list: sql<ModuleKey[]>`coalesce(array_agg(${accountModules.module}::text), '{}')` })
      .from(accountModules)
      .where(eq(accountModules.accountId, accounts.id))
    const [row] = await this.db
      .select({
        accountId: accounts.id,
        type: accounts.type,
        name: accounts.name,
        enabled: accounts.enabled,
        modules: sql<ModuleKey[]>`(${modules})`,
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
      .where(eq(accounts.openid, openid))
    return row
  }
}
