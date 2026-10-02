// 财务模块对外的读：模块首页的财务待办 = 有预收的客户（待付款单据在阶段 4 加）
import { TODO_PREVIEW_COUNT, type TodoItem } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { receipts } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { SalesService } from '../sales/sales.service.ts'
import { loadLedgers } from './ledger.ts'
import { ApReads } from './ap-reads.ts'
import type { Viewer } from '../../common/domain/viewer.ts'

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sales: SalesService,
    private readonly ap: ApReads,
  ) {}

  async todos(viewer: Viewer) {
    const payables = await this.ap.todos(viewer)
    const prepaid = await this.prepaidTodos()
    return {
      count: payables.count + prepaid.count,
      items: [...payables.items, ...prepaid.items].slice(0, TODO_PREVIEW_COUNT),
    }
  }

  // 有预收的客户，按还有余额的最早一笔收款先后
  async prepaidTodos(): Promise<{ count: number; items: TodoItem[] }> {
    const owners = await this.db
      .selectDistinct({ customerId: receipts.customerId })
      .from(receipts)
      .where(eq(receipts.status, 'valid'))
    const ids = owners.map((owner) => owner.customerId)
    const ledgers = await loadLedgers(this.db, this.sales, ids)
    const names = new Map((await this.sales.customersByIds(ids)).map((c) => [c.id, c.name]))
    const withPrepaid = [...ledgers.values()]
      .filter((ledger) => ledger.prepaidCents > 0)
      .map((ledger) => {
        const first = ledger.receipts.find(
          (receipt) => (ledger.replay.left.get(receipt.id) ?? 0) > 0,
        )
        return { ledger, since: first?.receiptDate ?? '' }
      })
      .sort((a, b) => a.since.localeCompare(b.since) || a.ledger.customerId - b.ledger.customerId)
    return {
      count: withPrepaid.length,
      items: withPrepaid.slice(0, TODO_PREVIEW_COUNT).map(({ ledger }) => ({
        kind: 'prepaid' as const,
        customerId: String(ledger.customerId),
        customerName: names.get(ledger.customerId) ?? '',
        prepaidCents: ledger.prepaidCents,
      })),
    }
  }
}
