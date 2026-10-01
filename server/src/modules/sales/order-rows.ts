// 订单卡片、明细行的查询：订单列表、详情、发货单、待办共用。一页订单的明细一次查完，不在循环里查库
import type { OrderStatus } from '@huazhong/shared'
import { and, count, eq, exists, inArray, ne, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  afterLines,
  afters,
  catalogItems,
  customers,
  orderChanges,
  orderLines,
  orders,
  products,
  stores,
} from '../../../db/schema/index.ts'
import { BUSINESS_TIME_ZONE } from '../../common/clock.ts'
import { waitCounts } from '../../common/domain/counts.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found, ownStoreId } from '../../common/scope.ts'
import type { LineRow } from './domain/order-view.ts'

export type Executor = Db | Tx

// 待处理、已处理的售后占用可申请数量；关闭、作废后恢复（03 章第 4 节）
const CLAIMING_STATUSES = ['pending', 'processed'] as const

// 这一行（外层的 order_lines）待处理、已处理售后的合计；可以排除某张售后本身
export function claimedQtyOf(executor: Executor, exceptAfterId: number | null = null): SQL<number> {
  const total = executor
    .select({ total: sql<number>`coalesce(sum(${afterLines.qty}), 0)::int` })
    .from(afterLines)
    .innerJoin(afters, eq(afters.id, afterLines.afterId))
    .where(
      and(
        eq(afterLines.orderLineId, orderLines.id),
        inArray(afters.status, [...CLAIMING_STATUSES]),
        exceptAfterId === null ? undefined : ne(afters.id, exceptAfterId),
      ),
    )
  return sql<number>`(${total})`
}

// 实际发货那天（上海日期）
export const shippedDayOf = sql<
  string | null
>`to_char(${orders.shippedAt} AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD')`

// 至少一行实发大于售后合计：还能申请或新建售后
export function claimableExists(executor: Executor): SQL {
  const lines = executor
    .select({ one: sql`1` })
    .from(orderLines)
    .where(
      and(
        eq(orderLines.orderId, orders.id),
        sql`${orderLines.shippedQty} > ${claimedQtyOf(executor)}`,
      ),
    )
  return exists(lines)
}

// 只有发货模块的员工：列表只看待发货、已发货；详情另能看已取消（发货提交时要看到「销售已取消」）
export const SHIPPING_LIST: readonly OrderStatus[] = ['to_ship', 'shipped']
export const SHIPPING_DETAIL: readonly OrderStatus[] = ['to_ship', 'shipped', 'cancelled']

// 门店只看本店；销售、财务看全部；只有发货模块的按状态限定
export function orderVisibleTo(viewer: Viewer, statuses: readonly OrderStatus[]): SQL | undefined {
  const storeId = ownStoreId(viewer)
  if (storeId !== null) return eq(orders.storeId, storeId)
  if (viewer.modules.includes('sales') || viewer.modules.includes('finance')) return undefined
  return inArray(orders.status, [...statuses])
}

// 列表顶层的状态计数：和列表同样的条件（客户、门店名可能在搜索里），只数给定的等待类状态
export async function orderStatusCounts(
  executor: Executor,
  where: SQL | undefined,
  codes: readonly OrderStatus[],
): Promise<Partial<Record<OrderStatus, number>>> {
  const rows = await executor
    .select({ status: orders.status, count: count() })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(and(where, inArray(orders.status, [...codes])))
    .groupBy(orders.status)
  return waitCounts(codes, rows)
}

// 行锁订单：写接口先锁住再按最新详情判断（门店只能锁本店的）
export async function lockOrder(tx: Tx, viewer: Viewer, id: number): Promise<void> {
  const storeId = ownStoreId(viewer)
  const [row] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, id), storeId === null ? undefined : eq(orders.storeId, storeId)))
    .for('update')
  found(row)
}

export function orderRowsQuery(executor: Executor) {
  const changed = executor
    .select({ one: sql`1` })
    .from(orderChanges)
    .where(eq(orderChanges.orderId, orders.id))
  return executor
    .select({
      id: orders.id,
      no: orders.no,
      version: orders.version,
      status: orders.status,
      origin: orders.origin,
      orderDate: orders.orderDate,
      shipDate: orders.shipDate,
      customerId: orders.customerId,
      customerName: customers.name,
      customerEnabled: customers.enabled,
      storeId: orders.storeId,
      storeName: stores.name,
      storeEnabled: stores.enabled,
      shippedAt: orders.shippedAt,
      shippedDay: shippedDayOf,
      changed: sql<boolean>`${exists(changed)}`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .$dynamic()
}

export async function loadLineRows(
  executor: Executor,
  orderIds: readonly number[],
): Promise<LineRow[]> {
  if (orderIds.length === 0) return []
  return executor
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      productId: orderLines.productId,
      name: orderLines.name,
      unit: orderLines.unit,
      customerCode: orderLines.customerCode,
      qty: orderLines.qty,
      priceCents: orderLines.priceCents,
      listPriceCents: orderLines.listPriceCents,
      shippedQty: orderLines.shippedQty,
      claimedQty: claimedQtyOf(executor),
      discontinued: sql<boolean>`NOT (${products.enabled} AND coalesce(${catalogItems.enabled}, false))`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(products, eq(products.id, orderLines.productId))
    .leftJoin(
      catalogItems,
      and(
        eq(catalogItems.customerId, orders.customerId),
        eq(catalogItems.productId, orderLines.productId),
      ),
    )
    .where(inArray(orderLines.orderId, [...orderIds]))
    .orderBy(orderLines.orderId, orderLines.sort)
}
