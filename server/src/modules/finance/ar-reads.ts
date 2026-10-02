// 客户对账、发货单弹层、登记收款表单、门店对账（05 章第 5、10 节）：都从同一份应收账算，不存库
import {
  appError,
  waitCodesOf,
  type ArCard,
  type contract,
  type OutputOf,
  type PayStatus,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import type { Db, Tx } from '../../../db/client.ts'
import { DB } from '../../common/db.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { decodeCursor, pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { SalesService } from '../sales/sales.service.ts'
import { summaryOf } from './domain/ar.ts'
import {
  effectiveAllocations,
  loadLedger,
  loadLedgers,
  type Ledger,
} from '../../common/customer-ledger.ts'
import { refundView } from '../../common/finance-history.ts'

interface Range {
  from?: string | undefined
  to?: string | undefined
}

interface PageQuery {
  cursor?: string | undefined
  limit: number
}

type Entry = Ledger['cards'][number]

// 对账按出货日期筛（两头都含）；预收不受筛选影响
function inRange(entry: Entry, range: Range): boolean {
  const day = entry.order.shipDate
  return (
    (range.from === undefined || day >= range.from) && (range.to === undefined || day <= range.to)
  )
}

const keyOf = (entry: Entry): [string, number] => [entry.order.shipDate, entry.order.orderId]

// 已按 (出货日期, id) 倒序的发货单，在内存里按游标分页
function pageEntries(entries: readonly Entry[], query: PageQuery) {
  let rest = [...entries]
  if (query.cursor !== undefined) {
    const [key, id] = decodeCursor(query.cursor)
    rest = rest.filter(
      ({ order }) =>
        order.shipDate < String(key) || (order.shipDate === String(key) && order.orderId < id),
    )
  }
  const page = pageOf(rest, query.limit, keyOf)
  return { items: page.items.map((entry) => entry.card), nextCursor: page.nextCursor }
}

function payCounts(cards: readonly ArCard[]): Partial<Record<PayStatus, number>> {
  const counts: Partial<Record<PayStatus, number>> = {}
  for (const code of waitCodesOf('payStatus')) {
    counts[code] = cards.filter((card) => card.payStatus === code).length
  }
  return counts
}

@Injectable()
export class ArReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sales: SalesService,
  ) {}

  async customers(
    query: PageQuery & { q?: string | undefined },
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.listArCustomers>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.customers(query, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const rows = await this.sales.customers(query)
    const page = pageOf(rows, query.limit, (row) => [row.id, row.id])
    const ledgers = await loadLedgers(
      executor,
      this.sales,
      page.items.map((row) => row.id),
    )
    return {
      items: page.items.map((row) => {
        const ledger = ledgers.get(row.id)
        return {
          customerId: String(row.id),
          customerName: row.name,
          enabled: row.enabled,
          ...summaryOf(ledger?.cards.map((entry) => entry.card) ?? []),
          prepaidCents: ledger?.prepaidCents ?? 0,
        }
      }),
      nextCursor: page.nextCursor,
      actions: [],
    }
  }

  async customer(
    id: number,
    query: PageQuery & Range & { status?: PayStatus | undefined },
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.getArCustomer>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.customer(id, query, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const customer = await this.sales.customer(executor, id)
    const ledger = await loadLedger(executor, this.sales, id)
    const ranged = ledger.cards.filter((entry) => inRange(entry, query))
    const cards = ranged.map((entry) => entry.card)
    const listed = ranged.filter(
      (entry) => query.status === undefined || entry.card.payStatus === query.status,
    )
    const hasUnpaid = ledger.cards.some((entry) => entry.card.unpaidCents > 0)
    return {
      ...pageEntries(listed, query),
      actions: [
        actionOf('registerReceipt', null, null),
        ...(ledger.prepaidCents > 0 && hasUnpaid ? [actionOf('allocate', null, false)] : []),
      ],
      counts: payCounts(cards),
      customerId: String(id),
      customerName: customer.name,
      ...summaryOf(cards),
      prepaidCents: ledger.prepaidCents,
      refunds: await Promise.all(ledger.refunds.map((row) => refundView(executor, row))),
    }
  }

  // 登记收款、核销预收表单：全部有未收的发货单，出货日期升序
  async unpaidOrders(
    id: number,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.listUnpaidOrders>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.unpaidOrders(id, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    await this.sales.customer(executor, id)
    const ledger = await loadLedger(executor, this.sales, id)
    const items = ledger.cards
      .filter((entry) => entry.card.unpaidCents > 0)
      .reverse()
      .map((entry) => entry.card)
    return { ledgerToken: ledger.token, prepaidCents: ledger.prepaidCents, items }
  }

  async order(
    viewer: Viewer,
    orderId: number,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.getArOrder>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.order(viewer, orderId, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    const customerId = await this.sales.shippedOrderCustomer(executor, orderId)
    const ledger = await loadLedger(executor, this.sales, customerId)
    const entry = ledger.cards.find((item) => item.order.orderId === orderId)
    if (!entry) throw appError.notFound()
    return {
      ...entry.card,
      customerId: String(customerId),
      afters: (await this.sales.processedAfterCards(executor, orderId, viewer)).map((after) => ({
        ...after,
        actions: [],
      })),
      allocations: await effectiveAllocations(
        ledger,
        (alloc) => alloc.orderId === orderId,
        executor,
        viewer,
      ),
    }
  }

  // 门店对账：只看本店发货单；发货金额 − 售后 − 已付 = 待付，不显示预收
  async storeStatement(
    viewer: Viewer,
    query: PageQuery & Range,
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.storeStatement>> {
    if (executor === this.db)
      return this.db.transaction((tx) => this.storeStatement(viewer, query, tx), {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      })
    if (viewer.customerId === null || viewer.storeId === null) throw appError.internal()
    const storeId = viewer.storeId
    const ledger = await loadLedger(executor, this.sales, viewer.customerId)
    const own = ledger.cards.filter(
      (entry) => entry.order.storeId === storeId && inRange(entry, query),
    )
    const summary = summaryOf(own.map((entry) => entry.card))
    return {
      ...pageEntries(own, query),
      actions: [],
      shippedCents: summary.shippedCents,
      afterCents: summary.afterCents,
      paidCents: summary.receivedCents,
      unpaidCents: summary.unpaidCents,
    }
  }
}
