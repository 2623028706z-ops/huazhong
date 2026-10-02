import {
  contract,
  labels,
  copy,
  type InviteCard,
  type InviteDetail,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import {
  accounts,
  inviteLines,
  invites,
  inviteSupplyLines,
  materials,
  purchaseOrders,
  suppliers,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { unitTotalsOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'

type Executor = Db | Tx
function rowsQuery(executor: Executor) {
  return executor
    .select({
      invite: invites,
      supplierName: suppliers.name,
      buyerName: accounts.name,
      purchaseOrderId: purchaseOrders.id,
      purchaseOrderNo: purchaseOrders.no,
      purchaseOrderStatus: purchaseOrders.status,
    })
    .from(invites)
    .innerJoin(suppliers, eq(suppliers.id, invites.supplierId))
    .innerJoin(accounts, eq(accounts.id, invites.buyerId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.inviteId, invites.id))
}
type Row = Awaited<ReturnType<typeof rowsQuery>>[number]
type Line = typeof inviteLines.$inferSelect
function cardOf(row: Row, lines: Line[], viewer: Viewer): InviteCard {
  const pending = row.invite.status === 'pending'
  const actions =
    viewer.type === 'supplier'
      ? pending
        ? [enabledAction('submitSupply', false)]
        : []
      : pending
        ? [
            enabledAction('editInvite', false),
            enabledAction('cancelInvite', false),
            enabledAction('shareInvite', null),
          ]
        : []
  return {
    id: String(row.invite.id),
    no: row.invite.no,
    version: row.invite.version,
    inviteDate: row.invite.inviteDate,
    supplierId: String(row.invite.supplierId),
    supplierName: row.supplierName,
    buyerName: row.buyerName,
    status: row.invite.status,
    units: unitTotalsOf(lines.map((line) => ({ unit: line.unit, qty: line.needQty }))),
    materialNames: lines.map((line) => line.name),
    purchaseOrderId: row.purchaseOrderId === null ? null : String(row.purchaseOrderId),
    purchaseOrderNo: row.purchaseOrderNo,
    purchaseOrderStatus: row.purchaseOrderStatus,
    actions,
    lockedReason: pending
      ? null
      : copy.finance.inviteStateLocked(labels.inviteStatus[row.invite.status]),
  }
}
function own(viewer: Viewer): SQL | undefined {
  return viewer.type === 'supplier' ? eq(invites.supplierId, viewer.supplierId ?? 0) : undefined
}
@Injectable()
export class InviteReads {
  constructor(@Inject(DB) private readonly db: Db) {}
  get(viewer: Viewer, id: number) {
    return this.detail(this.db, viewer, id)
  }
  async cards(executor: Executor, viewer: Viewer, where?: SQL) {
    const rows = await rowsQuery(executor)
      .where(and(where, own(viewer)))
      .orderBy(asc(invites.inviteDate), asc(invites.id))
    const lines =
      rows.length === 0
        ? []
        : await executor
            .select()
            .from(inviteLines)
            .where(
              inArray(
                inviteLines.inviteId,
                rows.map((row) => row.invite.id),
              ),
            )
            .orderBy(asc(inviteLines.sort))
    return rows.map((row) =>
      cardOf(
        row,
        lines.filter((line) => line.inviteId === row.invite.id),
        viewer,
      ),
    )
  }
  async list(
    viewer: Viewer,
    query: ParsedInput<typeof contract.listInvites>['query'],
  ): Promise<OutputOf<typeof contract.listInvites>> {
    const base = and(
      own(viewer),
      query.supplierId ? eq(invites.supplierId, Number(query.supplierId)) : undefined,
    )
    const rows = await rowsQuery(this.db)
      .where(
        and(
          base,
          query.status ? eq(invites.status, query.status) : undefined,
          beforeCursor(invites.inviteDate, invites.id, query.cursor),
        ),
      )
      .orderBy(desc(invites.inviteDate), desc(invites.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.invite.inviteDate, row.invite.id])
    const lines =
      page.items.length === 0
        ? []
        : await this.db
            .select()
            .from(inviteLines)
            .where(
              inArray(
                inviteLines.inviteId,
                page.items.map((row) => row.invite.id),
              ),
            )
            .orderBy(asc(inviteLines.sort))
    const [pending] = await this.db
      .select({ total: count() })
      .from(invites)
      .where(and(base, eq(invites.status, 'pending')))
    return {
      items: page.items.map((row) =>
        cardOf(
          row,
          lines.filter((line) => line.inviteId === row.invite.id),
          viewer,
        ),
      ),
      nextCursor: page.nextCursor,
      counts: { pending: pending?.total ?? 0 },
      actions: [],
    }
  }
  async detail(executor: Executor, viewer: Viewer, id: number): Promise<InviteDetail> {
    const [row] = await rowsQuery(executor).where(and(eq(invites.id, id), own(viewer)))
    const invite = found(row)
    const lines = await executor
      .select({ line: inviteLines, enabled: materials.enabled })
      .from(inviteLines)
      .innerJoin(materials, eq(materials.id, inviteLines.materialId))
      .where(eq(inviteLines.inviteId, id))
      .orderBy(asc(inviteLines.sort))
    const supply = await executor
      .select()
      .from(inviteSupplyLines)
      .where(eq(inviteSupplyLines.inviteId, id))
      .orderBy(asc(inviteSupplyLines.sort))
    return {
      ...cardOf(
        invite,
        lines.map((row) => row.line),
        viewer,
      ),
      lines: lines.map(({ line, enabled }) => ({
        id: String(line.id),
        materialId: String(line.materialId),
        name: line.name,
        unit: line.unit,
        needQty: line.needQty,
        enabled,
      })),
      supply: supply.map((line) => ({
        materialId: String(line.materialId),
        name: line.name,
        unit: line.unit,
        qty: line.qty,
        priceCents: line.priceCents,
      })),
      cancelNote: invite.invite.cancelNote,
      cancelledAt: invite.invite.cancelledAt?.toISOString() ?? null,
      submittedAt: invite.invite.submittedAt?.toISOString() ?? null,
    }
  }
}
