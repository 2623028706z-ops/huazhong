import {
  addDays,
  appError,
  contract,
  copy,
  DEMAND_DEFAULT_DAYS,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  customers,
  materials,
  orderLines,
  orders,
  productBomLines,
  stores,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'

type Query = ParsedInput<typeof contract.listPurchaseDemand>['query']
type Demand = OutputOf<typeof contract.listPurchaseDemand>
type InviteSource = Demand['mats'][number]['invites']
const materialKey = sql`${materials}.${sql.identifier(materials.id.name)}`
const stockQty =
  sql<number>`coalesce((SELECT sum(left_qty) FROM stock_batches WHERE material_id = ${materialKey}), 0)`
    .mapWith(Number)
    .as('stock_qty')
const inTransitQty =
  sql<number>`coalesce((SELECT sum(l.qty) FROM purchase_order_lines l JOIN purchase_orders p ON p.id = l.po_id WHERE l.material_id = ${materialKey} AND p.status = 'to_receive'), 0)`
    .mapWith(Number)
    .as('in_transit_qty')
const inviteSources =
  sql<InviteSource>`coalesce((SELECT jsonb_agg(jsonb_build_object('inviteId', i.id::text, 'no', i.no, 'supplierName', s.name, 'needQty', l.need_qty) ORDER BY i.invite_date, i.id) FROM invite_lines l JOIN invites i ON i.id = l.invite_id JOIN suppliers s ON s.id = i.supplier_id WHERE l.material_id = ${materialKey} AND i.status = 'pending'), '[]'::jsonb)`.as(
    'invite_sources',
  )

@Injectable()
export class PurchaseDemand {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}
  private range(query: Query) {
    const from = query.from ?? this.clock.today()
    const to = query.to ?? addDays(from, DEMAND_DEFAULT_DAYS - 1)
    if (to < from)
      throw appError.validation({ from: copy.error.dateRange, to: copy.error.dateRange })
    return { from, to }
  }
  private demandRows(range: { from: string; to: string }) {
    return this.db
      .select({
        materialId: materials.id,
        name: materials.name,
        unit: materials.unit,
        enabled: materials.enabled,
        needQty: sql<number>`sum(${orderLines.qty}::bigint * ${productBomLines.qty})`
          .mapWith(Number)
          .as('need_qty'),
        stockQty,
        inTransitQty,
        invites: inviteSources,
      })
      .from(materials)
      .innerJoin(productBomLines, eq(productBomLines.materialId, materials.id))
      .innerJoin(orderLines, eq(orderLines.productId, productBomLines.productId))
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(and(eq(orders.status, 'to_ship'), dateBetween(orders.shipDate, range)))
      .groupBy(materials.id)
      .orderBy(asc(materials.code), asc(materials.id))
      .as('demand_rows')
  }
  async demand(query: Query): Promise<Demand> {
    const range = this.range(query)
    const d = this.demandRows(range)
    const total = this.db
      .select({ value: sql<number>`count(*)`.mapWith(Number).as('value') })
      .from(orders)
      .where(and(eq(orders.status, 'to_ship'), dateBetween(orders.shipDate, range)))
      .as('order_count')
    const [result] = await this.db
      .select({
        orderCount: total.value,
        mats: sql<Demand['mats']>`coalesce(jsonb_agg(jsonb_build_object(
        'materialId', ${d.materialId}::text, 'name', ${d.name}, 'unit', ${d.unit}, 'enabled', ${d.enabled},
        'needQty', ${d.needQty}, 'stockQty', ${d.stockQty}, 'inTransitQty', ${d.inTransitQty},
        'leftQty', ${d.stockQty} + ${d.inTransitQty} - ${d.needQty},
        'invited', jsonb_array_length(${d.invites}) > 0, 'invites', ${d.invites}
      ) ORDER BY ${d.materialId}) FILTER (WHERE ${d.materialId} IS NOT NULL), '[]'::jsonb)`,
      })
      .from(total)
      .leftJoin(d, sql`true`)
      .groupBy(total.value)
    return {
      ...range,
      orderCount: found(result).orderCount,
      mats: found(result).mats,
      actions: [enabledAction('inviteSupplier', null), enabledAction('createPo', null)],
    }
  }
  async sources(id: number, query: Query): Promise<OutputOf<typeof contract.listDemandSources>> {
    const [row] = await this.db
      .select({ id: materials.id, inTransitQty, invites: inviteSources })
      .from(materials)
      .where(eq(materials.id, id))
    const material = found(row)
    const rows = await this.sourceRows(id, this.range(query))
    const dates = [...new Set(rows.map((row) => row.shipDate ?? ''))]
    return {
      materialId: String(id),
      inTransitQty: material.inTransitQty,
      invites: material.invites,
      groups: dates.map((shipDate) => ({
        shipDate,
        items: rows
          .filter((row) => row.shipDate === shipDate)
          .map(({ orderId, shipDate: _date, ...line }) => ({
            ...line,
            orderId: String(orderId),
            materialQty: line.qty * line.bomQty,
          })),
      })),
    }
  }
  private sourceRows(id: number, range: { from: string; to: string }) {
    return this.db
      .select({
        shipDate: orders.shipDate,
        orderId: orders.id,
        orderNo: orders.no,
        customerName: customers.name,
        storeName: stores.name,
        productName: orderLines.name,
        qty: orderLines.qty,
        productUnit: orderLines.unit,
        bomQty: productBomLines.qty,
      })
      .from(orders)
      .innerJoin(orderLines, eq(orderLines.orderId, orders.id))
      .innerJoin(productBomLines, eq(productBomLines.productId, orderLines.productId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .innerJoin(stores, eq(stores.id, orders.storeId))
      .where(
        and(
          eq(orders.status, 'to_ship'),
          eq(productBomLines.materialId, id),
          dateBetween(orders.shipDate, range),
        ),
      )
      .orderBy(asc(orders.shipDate), asc(orders.id), asc(orderLines.sort))
  }
}
