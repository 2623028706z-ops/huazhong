import {
  addDays,
  appError,
  contract,
  copy,
  DEMAND_DEFAULT_DAYS,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  customers,
  materials,
  orderLines,
  orders,
  productBomLines,
  stores,
  suppliers,
} from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { ledgerToken } from '../../common/ledger.ts'
import type { WriteContext } from '../../common/write.service.ts'

type Query = ParsedInput<typeof contract.listPurchaseDemand>['query']
type Demand = OutputOf<typeof contract.listPurchaseDemand>
type ReviewInput = ParsedInput<typeof contract.reviewPurchase>['body']
type Review = OutputOf<typeof contract.reviewPurchase>
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
  sql<InviteSource>`coalesce((SELECT jsonb_agg(jsonb_build_object('inviteId', i.id::text, 'no', i.no, 'supplierId', s.id::text, 'supplierName', s.name, 'needQty', l.need_qty) ORDER BY i.invite_date, i.id) FROM invite_lines l JOIN invites i ON i.id = l.invite_id JOIN suppliers s ON s.id = i.supplier_id WHERE l.material_id = ${materialKey} AND i.status = 'pending'), '[]'::jsonb)`.as(
    'invite_sources',
  )

async function reviewMaterials(executor: Db | Tx, lines: ReviewInput['lines']) {
  return executor
    .select({
      id: materials.id,
      enabled: materials.enabled,
      stockQty,
      inTransitQty,
      invites: inviteSources,
    })
    .from(materials)
    .where(
      inArray(
        materials.id,
        lines.map((row) => Number(row.materialId)),
      ),
    )
    .orderBy(asc(materials.id))
}
type ReviewMaterials = Awaited<ReturnType<typeof reviewMaterials>>
function reviewDemand(input: ReviewInput, demand: Demand, mats: ReviewMaterials) {
  return input.lines.map((line) => {
    const mat = found(mats.find((row) => String(row.id) === line.materialId))
    const needQty = demand.mats.find((row) => row.materialId === line.materialId)?.needQty ?? 0
    return {
      materialId: line.materialId,
      needQty,
      stockQty: mat.stockQty,
      inTransitQty: mat.inTransitQty,
      leftQty: mat.stockQty + mat.inTransitQty - needQty,
    }
  })
}
function reviewWarnings(
  input: ReviewInput,
  currentDemand: Review['currentDemand'],
  mats: ReviewMaterials,
) {
  const warnings: OutputOf<typeof contract.reviewPurchase>['warnings'] = []
  for (const row of currentDemand) {
    const mat = found(mats.find((mat) => String(mat.id) === row.materialId))
    if (mat.invites.length)
      warnings.push({
        code: 'pending_invite',
        materialId: row.materialId,
        message: copy.rework.pendingInviteWarning,
        invites: mat.invites,
      })
    const expected = input.demandContext?.expected?.find(
      (item) => item.materialId === row.materialId,
    )
    if (
      expected &&
      (expected.needQty !== row.needQty ||
        expected.stockQty !== row.stockQty ||
        expected.inTransitQty !== row.inTransitQty)
    )
      warnings.push({
        code: 'gap_changed',
        materialId: row.materialId,
        message: copy.rework.gapChangedWarning,
        invites: mat.invites,
      })
  }
  return warnings
}
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
  private demandRows(range: { from: string; to: string }, executor: Db | Tx) {
    return executor
      .select({
        materialId: materials.id,
        code: materials.code,
        shipFrom: sql<string>`min(${orders.shipDate})`.as('ship_from'),
        shipTo: sql<string>`max(${orders.shipDate})`.as('ship_to'),
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
  async demand(query: Query, executor: Db | Tx = this.db): Promise<Demand> {
    const range = this.range(query)
    const d = this.demandRows(range, executor)
    const total = executor
      .select({ value: sql<number>`count(*)`.mapWith(Number).as('value') })
      .from(orders)
      .where(and(eq(orders.status, 'to_ship'), dateBetween(orders.shipDate, range)))
      .as('order_count')
    const [result] = await executor
      .select({
        orderCount: total.value,
        mats: sql<Demand['mats']>`coalesce(jsonb_agg(jsonb_build_object(
        'materialId', ${d.materialId}::text, 'code', ${d.code}, 'shipFrom', ${d.shipFrom}, 'shipTo', ${d.shipTo}, 'name', ${d.name}, 'unit', ${d.unit}, 'enabled', ${d.enabled},
        'needQty', ${d.needQty}, 'stockQty', ${d.stockQty}, 'inTransitQty', ${d.inTransitQty},
        'leftQty', ${d.stockQty} + ${d.inTransitQty} - ${d.needQty},
        'invited', jsonb_array_length(${d.invites}) > 0, 'invites', ${d.invites}
      ) ORDER BY ${d.materialId}) FILTER (WHERE ${d.materialId} IS NOT NULL), '[]'::jsonb)`,
      })
      .from(total)
      .leftJoin(d, sql`true`)
      .groupBy(total.value)
    const [overdue] = await executor
      .select({
        count: sql<number>`count(*)`.mapWith(Number),
        shipFrom: sql<string | null>`min(${orders.shipDate})`,
        shipTo: sql<string | null>`max(${orders.shipDate})`,
      })
      .from(orders)
      .where(and(eq(orders.status, 'to_ship'), sql`${orders.shipDate} < ${this.clock.today()}`))
    return {
      ...range,
      orderCount: found(result).orderCount,
      overdue: found(overdue),
      mats: found(result)
        .mats.filter((row) => query.shortageOnly !== true || row.leftQty < 0)
        .sort(
          (a, b) =>
            Math.max(-b.leftQty, 0) - Math.max(-a.leftQty, 0) ||
            a.shipFrom.localeCompare(b.shipFrom) ||
            a.code.localeCompare(b.code),
        ),
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
      inTransitSources: (
        await this.db.execute(
          sql`SELECT p.id::text AS "poId",p.no,s.id::text AS "supplierId",s.name AS "supplierName",sum(l.qty)::int AS qty,'to_receive' AS status FROM purchase_order_lines l JOIN purchase_orders p ON p.id=l.po_id JOIN suppliers s ON s.id=p.supplier_id WHERE l.material_id=${id} AND p.status='to_receive' GROUP BY p.id,s.id ORDER BY p.order_date,p.id`,
        )
      ).rows as OutputOf<typeof contract.listDemandSources>['inTransitSources'],
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
  async review(
    input: ParsedInput<typeof contract.reviewPurchase>['body'],
    executor: Db | Tx = this.db,
  ): Promise<OutputOf<typeof contract.reviewPurchase>> {
    const supplier = found(
      (
        await executor
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, Number(input.supplierId)))
      )[0],
    )
    if (!supplier.enabled) throw appError.businessRule(copy.error.supplierDisabled)
    const demand = await this.demand(input.demandContext ?? {}, executor)
    const mats = await reviewMaterials(executor, input.lines)
    if (mats.length !== input.lines.length || mats.some((row) => !row.enabled))
      throw appError.businessRule(copy.finance.materialDisabled)
    const currentDemand = reviewDemand(input, demand, mats)
    const warnings = reviewWarnings(input, currentDemand, mats)
    return {
      reviewToken: ledgerToken({ input, supplier, mats, currentDemand }),
      currentDemand,
      warnings,
    }
  }
  async assertReview(
    ctx: WriteContext,
    input:
      | ParsedInput<typeof contract.createPurchaseOrder>['body']
      | ParsedInput<typeof contract.createInvite>['body'],
    kind: 'po' | 'invite',
  ) {
    const body = {
      kind,
      supplierId: input.supplierId,
      lines: input.lines.map((row) => ({
        materialId: row.materialId,
        qty: 'qty' in row ? row.qty : row.needQty,
      })),
      ...(input.demandContext ? { demandContext: input.demandContext } : {}),
    }
    const latest = await this.review(body, ctx.tx)
    if (latest.reviewToken !== input.reviewToken)
      throw appError.stale(copy.rework.reviewStale, latest)
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
