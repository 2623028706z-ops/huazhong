// 销售模块对外的读：财务对账要的发货单、售后卡片、客户；模块首页的销售、发货待办（00 章第 11.2 节）
import { redesignCopy, type AfterCard } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, eq, inArray, lte } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { afters, customers, orders, orderCancelRequests } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { afterCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { searchAny } from '../../common/search.ts'
import { orderAfterCards } from './after-query.ts'

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

  async salesTodos(_viewer: Viewer) {
    const [orderTotal] = await this.db
      .select({ n: count() })
      .from(orders)
      .where(eq(orders.status, 'pending_confirm'))
    const [afterTotal] = await this.db
      .select({ n: count() })
      .from(afters)
      .where(eq(afters.status, 'pending'))
    const [cancelTotal] = await this.db
      .select({ n: count() })
      .from(orderCancelRequests)
      .where(eq(orderCancelRequests.status, 'pending'))
    const rows = [
      { key: 'pendingOrders', label: redesignCopy.pendingOrderTodo, count: orderTotal?.n ?? 0 },
      { key: 'cancelRequests', label: redesignCopy.cancelApplication, count: cancelTotal?.n ?? 0 },
      { key: 'pendingAfters', label: redesignCopy.pendingAfterTodo, count: afterTotal?.n ?? 0 },
    ]
    return { count: rows.reduce((n, row) => n + row.count, 0), rows }
  }
  async shippingTodos(_viewer: Viewer) {
    const [total] = await this.db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.status, 'to_ship'), lte(orders.shipDate, this.clock.today())))
    return {
      count: total?.n ?? 0,
      rows: [{ key: 'dueShipments', label: redesignCopy.dueShipmentTodo, count: total?.n ?? 0 }],
    }
  }
}
