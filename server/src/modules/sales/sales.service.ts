// 销售模块对外的读：财务对账要的发货单、售后卡片、客户；模块首页的销售、发货待办（00 章第 11.2 节）
import { TODO_PREVIEW_COUNT, type AfterCard, type TodoItem } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, eq, inArray, lte, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { afters, customers, orders } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { afterCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { searchAny } from '../../common/search.ts'
import { afterCardsOf, afterRowsQuery, orderAfterCards } from './after-query.ts'
import { orderCardsOf } from './order-query.ts'
import { orderRowsQuery } from './order-rows.ts'
import { shippedLedgerOrders } from '../../common/customer-ledger.ts'

type Executor = Db | Tx

// 已发货订单（发货单）：发货金额按实发，售后只算已处理的

export interface CustomerRef {
  id: number
  name: string
  enabled: boolean
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  shippedOrders(executor: Executor, customerIds: readonly number[]) {
    return shippedLedgerOrders(executor, customerIds)
  }

  // 发货单弹层里已处理的售后（项 actions ⊆ voidAfter）
  processedAfterCards(executor: Executor, orderId: number, viewer: Viewer): Promise<AfterCard[]> {
    return orderAfterCards(executor, orderId, viewer, ['processed'])
  }

  // 已发货订单属于哪个客户；不是已发货的当成找不到
  async shippedOrderCustomer(executor: Executor, orderId: number): Promise<number> {
    const [row] = await executor
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.status, 'shipped')))
    return found(row).customerId
  }

  async customer(executor: Executor, id: number): Promise<CustomerRef> {
    const [row] = await executor
      .select({ id: customers.id, name: customers.name, enabled: customers.enabled })
      .from(customers)
      .where(eq(customers.id, id))
    return found(row)
  }

  // 按 id 升序分页，名称搜索
  customers(query: {
    q?: string | undefined
    cursor?: string | undefined
    limit: number
  }): Promise<CustomerRef[]> {
    return this.db
      .select({ id: customers.id, name: customers.name, enabled: customers.enabled })
      .from(customers)
      .where(
        and(
          searchAny(query.q, [customers.name]),
          afterCursor(customers.id, customers.id, query.cursor),
        ),
      )
      .orderBy(asc(customers.id))
      .limit(query.limit + 1)
  }

  async customersByIds(ids: readonly number[]): Promise<CustomerRef[]> {
    if (ids.length === 0) return []
    return this.db
      .select({ id: customers.id, name: customers.name, enabled: customers.enabled })
      .from(customers)
      .where(inArray(customers.id, [...ids]))
      .orderBy(asc(customers.id))
  }

  private async orderTodos(viewer: Viewer, where: SQL, order: SQL[]) {
    const rows = await orderRowsQuery(this.db)
      .where(where)
      .orderBy(...order)
      .limit(TODO_PREVIEW_COUNT)
    const [total] = await this.db.select({ total: count() }).from(orders).where(where)
    const cards = await orderCardsOf(this.db, rows, viewer, this.clock.today())
    return { count: total?.total ?? 0, cards }
  }

  // 销售：待确认订单 + 待处理售后，最早的在前
  async salesTodos(viewer: Viewer): Promise<{ count: number; items: TodoItem[] }> {
    const pendingOrders = await this.orderTodos(viewer, eq(orders.status, 'pending_confirm'), [
      asc(orders.orderDate),
      asc(orders.id),
    ])
    const pendingAfter = eq(afters.status, 'pending')
    const afterRows = await afterRowsQuery(this.db)
      .where(pendingAfter)
      .orderBy(asc(afters.afterDate), asc(afters.id))
      .limit(TODO_PREVIEW_COUNT)
    const [afterTotal] = await this.db.select({ total: count() }).from(afters).where(pendingAfter)
    const afterCards = await afterCardsOf(this.db, afterRows, viewer)
    const items: { date: string; item: TodoItem }[] = [
      ...pendingOrders.cards.map((order) => ({
        date: order.orderDate,
        item: { kind: 'order' as const, order },
      })),
      ...afterCards.map((after) => ({
        date: after.afterDate,
        item: { kind: 'after' as const, after },
      })),
    ]
    items.sort((a, b) => a.date.localeCompare(b.date))
    return {
      count: pendingOrders.count + (afterTotal?.total ?? 0),
      items: items.slice(0, TODO_PREVIEW_COUNT).map((entry) => entry.item),
    }
  }

  // 发货：出货日期不晚于今天的待发货，按出货日期升序
  async shippingTodos(viewer: Viewer): Promise<{ count: number; items: TodoItem[] }> {
    const due =
      and(eq(orders.status, 'to_ship'), lte(orders.shipDate, this.clock.today())) ?? sql`false`
    const { count: total, cards } = await this.orderTodos(viewer, due, [
      asc(orders.shipDate),
      asc(orders.id),
    ])
    return { count: total, items: cards.map((order) => ({ kind: 'order' as const, order })) }
  }
}
