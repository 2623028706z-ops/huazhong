// 门店首页（05 章第 5 节）：客户停用时给一句提示，门店账号照常登录（03 章第 5 节）。
// 可订款数 orderableCount 在阶段 3 有了订货目录再加（08 章）
import { appError, copy, type StoreHome } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { customers } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'

@Injectable()
export class StoreService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async home(viewer: Viewer): Promise<StoreHome> {
    // 门店账号一定有客户（accounts_store_link + stores.customer_id NOT NULL）
    if (viewer.customerId === null) throw appError.internal()
    const [customer] = await this.db
      .select({ enabled: customers.enabled })
      .from(customers)
      .where(eq(customers.id, viewer.customerId))
    if (!customer) throw appError.internal()
    return { lockedReason: customer.enabled ? null : copy.store.customerDisabled }
  }
}
