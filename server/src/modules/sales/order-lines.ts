// 订单写接口共用的数据读写：目录项、明细整组替换、日志和推送的格式（05 章第 4、5 节）
import { appError, copy, type OrderDetail } from '@huazhong/shared'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import {
  catalogItems,
  orderChanges,
  orderLines,
  orders,
  products,
} from '../../../db/schema/index.ts'
import { actorLabelOf } from '../../common/domain/viewer.ts'
import type { WriteContext } from '../../common/write.service.ts'
import type { LineState, OrderState } from './domain/order-diff.ts'
import type { CatalogEntry } from './domain/order-rules.ts'
import { lockCustomer } from '../../common/org.ts'

// 这些产品在这个客户下的可订情况（产品不存在的不返回）
export async function catalogEntriesOf(
  tx: Tx,
  customerId: number,
  productIds: readonly number[],
): Promise<CatalogEntry[]> {
  if (productIds.length === 0) return []
  return tx
    .select({
      productId: products.id,
      name: products.name,
      unit: products.unit,
      customerCode: sql<string>`coalesce(${catalogItems.customerCode}, '')`,
      productEnabled: products.enabled,
      catalogEnabled: catalogItems.enabled,
      listPriceCents: catalogItems.priceCents,
    })
    .from(products)
    .leftJoin(
      catalogItems,
      and(eq(catalogItems.productId, products.id), eq(catalogItems.customerId, customerId)),
    )
    .where(inArray(products.id, [...productIds]))
}

// 门店下单、改单先共享锁这个客户的目录，再锁订单：和「目录调价同步待确认订单」互斥，加锁顺序一致
export async function lockCatalogShare(tx: Tx, customerId: number): Promise<void> {
  await lockCustomer(tx, customerId)
  await tx
    .select({ id: catalogItems.id })
    .from(catalogItems)
    .where(eq(catalogItems.customerId, customerId))
    .orderBy(catalogItems.id)
    .for('share')
}

export interface NewLine extends LineState {
  listPriceCents: number
  // 下单时的客户产品编码快照
  customerCode: string
}

// 整组替换明细（改单）；新建时 orderId 下还没有行
export async function replaceLines(
  tx: Tx,
  order: { id: number; createdBy: number },
  lines: readonly NewLine[],
): Promise<void> {
  await tx.delete(orderLines).where(eq(orderLines.orderId, order.id))
  await tx.insert(orderLines).values(
    lines.map((line, sort) => ({
      orderId: order.id,
      productId: line.productId,
      name: line.name,
      unit: line.unit,
      customerCode: line.customerCode,
      qty: line.qty,
      priceCents: line.priceCents,
      listPriceCents: line.listPriceCents,
      sort,
      createdBy: order.createdBy,
    })),
  )
}

// 变更记录：改了什么、原因（门店改单没有）、谁；内容没变的调用前已经拦住
export async function insertChange(
  ctx: WriteContext,
  orderId: number,
  items: readonly string[],
  reason = '',
): Promise<void> {
  const viewer = ctx.viewer
  if (!viewer) throw appError.internal()
  await ctx.tx.insert(orderChanges).values({
    orderId,
    actorLabel: actorLabelOf(viewer),
    reason,
    items: [...items],
    createdBy: viewer.accountId,
  })
}

export const orderVersionPlusOne = sql`${orders.version} + 1`

// 变更记录、日志比较用的订单内容
export function orderStateOf(detail: OrderDetail): OrderState {
  return {
    status: detail.status,
    shipDate: detail.shipDate,
    note: detail.note ?? '',
    lines: detail.lines.map((line) => ({
      productId: Number(line.productId),
      name: line.name,
      unit: line.unit,
      qty: line.qty,
      priceCents: line.priceCents,
    })),
  }
}

// 订单日志：门店下单、改单也记在销售模块（销售要能看到）；确认发货记在发货模块
export function orderLog(
  detail: { id: string; no: string },
  action: string,
  module: 'sales' | 'shipping' = 'sales',
) {
  return {
    module,
    kind: copy.log.kind.order,
    action,
    targetType: 'orders',
    targetId: Number(detail.id),
    targetLabel: detail.no,
  }
}

type ExtraTopic = 'todo:sales' | 'todo:shipping' | 'demand' | `ar:${string}`

// 订单变了：详情、列表，以及待办、应收等；只推给这家门店
export function notifyOrder(ctx: WriteContext, detail: OrderDetail, extra: readonly ExtraTopic[]) {
  ctx.notify(
    [
      { topic: `order:${detail.id}`, version: detail.version },
      { topic: 'orders', version: null },
      { topic: 'demand', version: null },
      ...extra.map((topic) => ({ topic, version: null })),
    ],
    { storeIds: [detail.storeId] },
  )
}
