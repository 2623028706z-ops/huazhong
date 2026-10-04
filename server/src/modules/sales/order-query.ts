// 订单的读：列表、发货单、详情（05 章第 4–6 节）。写接口在同一个事务里读最新详情（STALE 的 latest、返回值）
import {
  appError,
  copy,
  redesignCopy,
  waitCodesOf,
  type contract,
  type OrderCard,
  type OrderDetail,
  type OrderStatus,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  accounts,
  customers,
  orderChanges,
  orders,
  stores,
  orderCancelRequests,
} from '../../../db/schema/index.ts'
import { shippingCard, shippingDetail } from './shipping-view.ts'
import { sourceStatement, sourceStatements, customerOverdue } from '../../common/statements.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { decodeCursor, pageOf, type Cursor } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { afterCursor, beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { searchAny } from '../../common/search.ts'
import { orderAfterCards } from './after-query.ts'
import { afterWindowStart, rolesOf } from './domain/order-actions.ts'
import { isOpenOrder, toOrderCard, toOrderLine, type OrderRow } from './domain/order-view.ts'
import {
  claimableExists,
  loadLineRows,
  orderRowsQuery,
  orderStatusCounts,
  orderVisibleTo,
  SHIPPING_DETAIL,
  SHIPPING_LIST,
  shippedDayOf,
  type Executor,
} from './order-rows.ts'

interface OrderQuery {
  status?: OrderStatus | undefined
  customerId?: string | undefined
  q?: string | undefined
  afterable?: boolean | undefined
  cancelRequested?: boolean | undefined
  from?: string | undefined
  to?: string | undefined
  cursor?: string | undefined
  limit: number
}

const orderSearch = (q: string | undefined) =>
  searchAny(q, [orders.no, customers.name, stores.name])

// 发货单的两段：待发货在前、已发货在后
type ShippingSegment = 'to_ship' | 'shipped'
function shippingSegmentsOf(query: {
  dueOnly?: boolean | undefined
  status?: ShippingSegment | undefined
}): readonly ShippingSegment[] {
  if (query.dueOnly) return ['to_ship']
  return query.status === undefined ? SHIPPING_SEGMENTS : [query.status]
}

const SHIPPING_SEGMENTS: readonly ShippingSegment[] = ['to_ship', 'shipped']

// 发货单游标的排序键写成「段|排序键」：待发货是出货日期，已发货是发货时间
function shippingCursorOf(
  row: Pick<OrderRow, 'id' | 'status' | 'shipDate'> & { shippedAt: Date | null },
): Cursor {
  const key = row.status === 'to_ship' ? (row.shipDate ?? '') : (row.shippedAt?.toISOString() ?? '')
  return [`${row.status}|${key}`, row.id]
}

function decodeShippingCursor(raw: string): { segment: ShippingSegment; at: Cursor } {
  const [key, id] = decodeCursor(raw)
  const [segment, ...rest] = String(key).split('|')
  const known = SHIPPING_SEGMENTS.find((s) => s === segment)
  if (known === undefined || rest.length === 0) {
    throw appError.validation({ cursor: copy.error.validationFallback })
  }
  return { segment: known, at: [rest.join('|'), id] }
}

// 还能申请或新建售后的已发货订单；门店另外要在售后申请期限内
function afterableWhere(executor: Executor, viewer: Viewer, today: string): SQL {
  const window =
    viewer.type === 'store' ? sql`${shippedDayOf} >= ${afterWindowStart(today)}` : sql`true`
  return sql`${orders.status} = 'shipped' AND ${claimableExists(executor)} AND ${window}`
}

// 一页订单的卡片：明细一次查完
async function orderCardsOf(
  executor: Executor,
  rows: readonly OrderRow[],
  viewer: Viewer,
  today: string,
): Promise<OrderCard[]> {
  const lines = await loadLineRows(
    executor,
    rows.map((row) => row.id),
  )
  const roles = rolesOf(viewer)
  const statements = await sourceStatements(
    executor,
    'order',
    rows.map((row) => row.id),
  )
  return rows.map((row) =>
    toOrderCard(
      { ...row, statement: statements.get(row.id) ?? null },
      lines.filter((line) => line.orderId === row.id),
      roles,
      today,
    ),
  )
}

// 详情独有的列：备注、发货人、发货备注、取消原因（没有的返回 null）
async function detailExtraOf(executor: Executor, id: number) {
  const [extra] = await executor
    .select({
      note: orders.note,
      confirmedAt: orders.confirmedAt,
      contactName: stores.contact,
      contactPhone: stores.phone,
      address: stores.address,
      shipNote: orders.shipNote,
      cancelReason: orders.cancelReason,
      cancelledAt: orders.cancelledAt,
      voidReason: orders.voidReason,
      voidedAt: orders.voidedAt,
      shippedBy: accounts.name,
    })
    .from(orders)
    .leftJoin(accounts, eq(accounts.id, orders.shippedBy))
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(eq(orders.id, id))
  const row = found(extra)
  return {
    note: orNull(row.note),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    address: row.address,
    shippedBy: row.shippedBy,
    shipNote: orNull(row.shipNote),
    cancelReason: row.cancelReason,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    voidReason: row.voidReason,
    voidedAt: row.voidedAt?.toISOString() ?? null,
  }
}

// 变更记录，按时间先后；门店改单没有原因
async function orderChangesOf(executor: Executor, id: number) {
  const rows = await executor
    .select()
    .from(orderChanges)
    .where(eq(orderChanges.orderId, id))
    .orderBy(asc(orderChanges.createdAt), asc(orderChanges.id))
  return rows.map((change) => ({
    id: String(change.id),
    createdAt: change.createdAt.toISOString(),
    actorLabel: change.actorLabel,
    reason: orNull(change.reason),
    items: change.items,
  }))
}

async function cancelRequestsOf(executor: Executor, id: number) {
  return (
    await executor
      .select({ request: orderCancelRequests, storeName: stores.name })
      .from(orderCancelRequests)
      .innerJoin(accounts, eq(accounts.id, orderCancelRequests.requestedBy))
      .innerJoin(stores, eq(stores.id, accounts.storeId))
      .where(eq(orderCancelRequests.orderId, id))
      .orderBy(asc(orderCancelRequests.requestedAt), asc(orderCancelRequests.id))
  ).map(({ request: row, storeName }) => ({
    id: String(row.id),
    status: row.status,
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    requestedBy: redesignCopy.storeActor(storeName),
    handledAt: row.handledAt?.toISOString() ?? null,
    rejectReason: row.rejectReason,
  }))
}
export async function orderDetailOf(
  executor: Executor,
  viewer: Viewer,
  id: number,
  today: string,
): Promise<OrderDetail> {
  const [row] = await orderRowsQuery(executor).where(
    and(eq(orders.id, id), orderVisibleTo(viewer, SHIPPING_DETAIL)),
  )
  const order = found(row)
  const extra = await detailExtraOf(executor, id)
  const lineRows = await loadLineRows(executor, [id])
  const statement = await sourceStatement(executor, 'order', id)
  return {
    ...toOrderCard({ ...order, statement }, lineRows, rolesOf(viewer), today),
    statement,
    overdue: viewer.modules.includes('sales')
      ? await customerOverdue(executor, order.customerId, today)
      : null,
    confirmedAt: extra.confirmedAt,
    contactName: extra.contactName,
    contactPhone: extra.contactPhone,
    address: extra.address,
    note: extra.note,
    customerEnabled: order.customerEnabled,
    storeEnabled: order.storeEnabled,
    lines: lineRows.map((line) => toOrderLine(line, isOpenOrder(order.status))),
    changes: await orderChangesOf(executor, id),
    shippedBy: extra.shippedBy,
    shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
    shipNote: extra.shipNote,
    cancelReason: extra.cancelReason,
    cancelledAt: extra.cancelledAt,
    voidReason: extra.voidReason,
    voidedAt: extra.voidedAt,
    cancelRequests: await cancelRequestsOf(executor, id),
    afters: order.status === 'shipped' ? await orderAfterCards(executor, id, viewer) : [],
  }
}

@Injectable()
export class OrderReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  async list(viewer: Viewer, query: OrderQuery): Promise<OutputOf<typeof contract.listOrders>> {
    const today = this.clock.today()
    const base = and(
      orderVisibleTo(viewer, SHIPPING_LIST),
      query.customerId === undefined ? undefined : eq(orders.customerId, Number(query.customerId)),
      orderSearch(query.q),
      dateBetween(orders.orderDate, query),
      query.afterable === true ? afterableWhere(this.db, viewer, today) : undefined,
      query.cancelRequested === undefined
        ? undefined
        : sql`EXISTS (SELECT 1 FROM order_cancel_requests cr WHERE cr.order_id = ${orders.id} AND cr.status = 'pending') = ${query.cancelRequested}`,
    )
    const rows = await orderRowsQuery(this.db)
      .where(
        and(
          base,
          query.status === undefined
            ? undefined
            : viewer.type === 'store' && query.status === 'cancelled'
              ? inArray(orders.status, ['cancelled', 'voided'])
              : eq(orders.status, query.status),
          beforeCursor(orders.orderDate, orders.id, query.cursor),
        ),
      )
      .orderBy(desc(orders.orderDate), desc(orders.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.orderDate, row.id])
    return {
      items: await orderCardsOf(this.db, page.items, viewer, today),
      nextCursor: page.nextCursor,
      actions: viewer.modules.includes('sales') ? [actionOf('create', null, null)] : [],
      counts: await orderStatusCounts(this.db, base, waitCodesOf('orderStatus')),
    }
  }

  // 一段发货单（游标落在这一段时从游标之后接着取）
  private shippingSegment(
    segment: ShippingSegment,
    search: SQL | undefined,
    cursor: Cursor | undefined,
    limit: number,
  ) {
    const toShip = segment === 'to_ship'
    const after = toShip
      ? afterCursor(orders.shipDate, orders.id, cursor)
      : beforeCursor(orders.shippedAt, orders.id, cursor)
    return orderRowsQuery(this.db)
      .where(and(eq(orders.status, segment), search, after))
      .orderBy(
        ...(toShip
          ? [asc(orders.shipDate), asc(orders.id)]
          : [desc(orders.shippedAt), desc(orders.id)]),
      )
      .limit(limit)
  }

  // 发货单：不传状态 = 待发货在前（出货日期升序，含以后的），已发货在后（发货时间降序）；
  // 游标带上所在的段，翻页跨段不重不漏
  async listShipping(
    viewer: Viewer,
    query: {
      status?: ShippingSegment | undefined
      q?: string | undefined
      dueOnly?: boolean | undefined
      cursor?: string | undefined
      limit: number
    },
  ): Promise<OutputOf<typeof contract.listShippingOrders>> {
    const today = this.clock.today()
    const search = and(
      orderSearch(query.q),
      query.dueOnly
        ? and(eq(orders.status, 'to_ship'), sql`${orders.shipDate} <= ${today}`)
        : undefined,
    )
    const segments = shippingSegmentsOf(query)
    const cursor = query.cursor === undefined ? null : decodeShippingCursor(query.cursor)
    const start = cursor === null ? 0 : segments.indexOf(cursor.segment)
    if (start < 0) throw appError.validation({ cursor: copy.error.validationFallback })
    const rows: Awaited<ReturnType<OrderReads['shippingSegment']>> = []
    for (const [index, segment] of segments.slice(start).entries()) {
      if (rows.length > query.limit) break
      const resume = index === 0 && cursor !== null ? cursor.at : undefined
      // 按段顺序取，后一段只补足前一段不够的条数；前一段够了就不查后一段
      rows.push(
        ...(await this.shippingSegment(segment, search, resume, query.limit + 1 - rows.length)),
      )
    }
    const page = pageOf(rows, query.limit, shippingCursorOf)
    return {
      items: (await orderCardsOf(this.db, page.items, viewer, today)).map(shippingCard),
      nextCursor: page.nextCursor,
      actions: [],
      counts: await orderStatusCounts(this.db, search, ['to_ship']),
    }
  }

  detail(viewer: Viewer, id: number): Promise<OrderDetail> {
    return this.db.transaction((tx) => orderDetailOf(tx, viewer, id, this.clock.today()), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }
  async shipping(viewer: Viewer, id: number) {
    return this.db.transaction(
      async (tx) =>
        shippingDetail(
          await orderDetailOf(
            tx,
            { ...viewer, type: 'staff', modules: ['shipping'] },
            id,
            this.clock.today(),
          ),
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
}
