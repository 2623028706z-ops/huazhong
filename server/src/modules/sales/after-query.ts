// 售后的读：列表、详情，以及订单详情、发货单弹层里的售后卡片（05 章第 4 节）
import {
  appError,
  copy,
  waitCodesOf,
  type AfterCard,
  type AfterDetail,
  type AfterStatus,
  type contract,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import {
  afterLineImages,
  afterLines,
  afters,
  customers,
  orderLines,
  orders,
  operationLogs,
  stores,
} from '../../../db/schema/index.ts'
import { sourceStatement, sourceStatements } from '../../common/statements.ts'
import { DB } from '../../common/db.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { waitCounts } from '../../common/domain/counts.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found, ownStoreId } from '../../common/scope.ts'
import { searchAny } from '../../common/search.ts'
import { FilesService } from '../files/files.service.ts'
import {
  afterRolesOf,
  toAfterCard,
  toAfterLine,
  type AfterLineRow,
  type AfterRow,
} from './domain/after-view.ts'
import { claimedQtyOf, type Executor } from './order-rows.ts'

type AfterQuery = {
  status?: AfterStatus | 'cancelled' | undefined
  customerId?: string | undefined
  q?: string | undefined
  from?: string | undefined
  to?: string | undefined
  cursor?: string | undefined
  limit: number
}

function afterRowsQuery(executor: Executor) {
  return executor
    .select({
      id: afters.id,
      no: afters.no,
      version: afters.version,
      status: afters.status,
      origin: afters.origin,
      createdBy: afters.createdBy,
      processedBy: afters.processedBy,
      afterDate: afters.afterDate,
      orderId: afters.orderId,
      orderNo: orders.no,
      customerId: afters.customerId,
      customerName: customers.name,
      storeId: afters.storeId,
      storeName: stores.name,
      amountCents: afters.amountCents,
      storeNoticeAt: afters.storeNoticeAt,
      storeSeenAt: afters.storeSeenAt,
    })
    .from(afters)
    .innerJoin(orders, eq(orders.id, afters.orderId))
    .innerJoin(customers, eq(customers.id, afters.customerId))
    .innerJoin(stores, eq(stores.id, afters.storeId))
    .$dynamic()
}

// 门店只看本店
export function afterVisibleTo(viewer: Viewer): SQL | undefined {
  const storeId = ownStoreId(viewer)
  return storeId === null ? undefined : eq(afters.storeId, storeId)
}

// 售后明细 + 原发货单这一行的实发、发货单价；exceptAfterId 的售后不算进「已申请」（处理某张售后时排除它本身）
async function loadAfterLines(
  executor: Executor,
  afterIds: readonly number[],
  exceptAfterId: number | null,
): Promise<AfterLineRow[]> {
  if (afterIds.length === 0) return []
  return executor
    .select({
      id: afterLines.id,
      afterId: afterLines.afterId,
      orderLineId: afterLines.orderLineId,
      name: afterLines.name,
      unit: afterLines.unit,
      requestedQty: afterLines.requestedQty,
      qty: afterLines.qty,
      priceCents: afterLines.priceCents,
      reason: afterLines.reason,
      description: afterLines.description,
      shippedQty: orderLines.shippedQty,
      shipPriceCents: orderLines.priceCents,
      otherClaimed: claimedQtyOf(executor, exceptAfterId),
    })
    .from(afterLines)
    .innerJoin(orderLines, eq(orderLines.id, afterLines.orderLineId))
    .where(inArray(afterLines.afterId, [...afterIds]))
    .orderBy(afterLines.afterId, afterLines.sort)
    .then((rows) => rows.map((row) => ({ ...row, shippedQty: row.shippedQty ?? 0 })))
}

// 一组售后的卡片：明细一次查完
async function afterCardsOf(
  executor: Executor,
  rows: readonly AfterRow[],
  viewer: Viewer,
): Promise<AfterCard[]> {
  const lines = await loadAfterLines(
    executor,
    rows.map((row) => row.id),
    null,
  )
  const roles = afterRolesOf(viewer)
  const statements = await sourceStatements(
    executor,
    'after',
    rows.map((row) => row.id),
  )
  return rows.map((row) =>
    toAfterCard(
      { ...row, statement: statements.get(row.id) ?? null },
      lines.filter((line) => line.afterId === row.id),
      roles,
    ),
  )
}

// 订单详情、发货单弹层里的售后：按售后日期先后
export async function orderAfterCards(
  executor: Executor,
  orderId: number,
  viewer: Viewer,
  statuses?: readonly AfterStatus[],
): Promise<AfterCard[]> {
  const rows = await afterRowsQuery(executor)
    .where(
      and(
        eq(afters.orderId, orderId),
        afterVisibleTo(viewer),
        statuses ? inArray(afters.status, [...statuses]) : undefined,
      ),
    )
    .orderBy(asc(afters.afterDate), asc(afters.id))
  return afterCardsOf(executor, rows, viewer)
}

// 门店售后段底栏「申请售后」→ 选订单页（2026-10-06 第 3 批）
function listActions(viewer: Viewer) {
  if (viewer.type === 'store') return [actionOf('applyAfter', null, null)]
  return viewer.modules.includes('sales') ? [actionOf('createAfter', null, null)] : []
}

function closedAtOf(status: AfterStatus, date: Date | null) {
  return status === 'closed' ? (date?.toISOString() ?? null) : null
}

@Injectable()
export class AfterReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly files: FilesService,
  ) {}

  async list(viewer: Viewer, query: AfterQuery): Promise<OutputOf<typeof contract.listAfters>> {
    const base = and(
      afterVisibleTo(viewer),
      searchAny(query.q, [afters.no, orders.no, customers.name, stores.name]),
      query.customerId === undefined ? undefined : eq(afters.customerId, Number(query.customerId)),
      dateBetween(afters.afterDate, query),
    )
    const rows = await afterRowsQuery(this.db)
      .where(
        and(
          base,
          query.status === undefined
            ? undefined
            : eq(afters.status, query.status === 'cancelled' ? 'voided' : query.status),
          beforeCursor(afters.afterDate, afters.id, query.cursor),
        ),
      )
      .orderBy(desc(afters.afterDate), desc(afters.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.afterDate, row.id])
    const counted = await this.db
      .select({ status: afters.status, count: count() })
      .from(afters)
      .where(and(base, inArray(afters.status, waitCodesOf('afterStatus'))))
      .groupBy(afters.status)
    return {
      items: await afterCardsOf(this.db, page.items, viewer),
      nextCursor: page.nextCursor,
      actions: listActions(viewer),
      counts: waitCounts(waitCodesOf('afterStatus'), counted),
    }
  }

  // 每行售后图片的签名地址，按上传顺序
  private async imagesOf(executor: Executor, lineIds: readonly number[]) {
    const images =
      lineIds.length === 0
        ? []
        : await executor
            .select({ afterLineId: afterLineImages.afterLineId, fileId: afterLineImages.fileId })
            .from(afterLineImages)
            .where(inArray(afterLineImages.afterLineId, [...lineIds]))
            .orderBy(afterLineImages.afterLineId, afterLineImages.sort)
    const urls = await this.files.urlsOf(
      executor,
      images.map((image) => image.fileId),
    )
    return (lineId: number) =>
      images
        .filter((image) => image.afterLineId === lineId)
        .flatMap((image) => {
          const url = urls.get(image.fileId)
          return url ? [{ fileId: String(image.fileId), ...url }] : []
        })
  }

  // 写接口在同一个事务里读最新详情（STALE 的 latest、返回值）
  async detail(executor: Executor, viewer: Viewer, id: number): Promise<AfterDetail> {
    const row = found(
      (await afterRowsQuery(executor).where(and(eq(afters.id, id), afterVisibleTo(viewer))))[0],
    )
    const [extra] = await executor
      .select({
        note: afters.note,
        processedAt: afters.processedAt,
        closeReason: afters.closeReason,
        closedAt: sql<Date | null>`(SELECT max(${operationLogs.createdAt}) FROM ${operationLogs}
          WHERE ${operationLogs.targetType} = 'afters' AND ${operationLogs.targetId} = ${afters.id}
            AND ${operationLogs.action} = ${copy.log.action.closeAfter})`.mapWith(
          (value: string) => new Date(value),
        ),
        voidReason: afters.voidReason,
        voidedAt: afters.voidedAt,
        shipDate: orders.shipDate,
      })
      .from(afters)
      .innerJoin(orders, eq(orders.id, afters.orderId))
      .where(eq(afters.id, id))
    if (!extra?.shipDate) throw appError.internal()
    const lines = await loadAfterLines(executor, [id], id)
    const imagesOf = await this.imagesOf(
      executor,
      lines.map((line) => line.id),
    )
    const statement = await sourceStatement(executor, 'after', id)
    return {
      ...toAfterCard({ ...row, statement }, lines, afterRolesOf(viewer)),
      shipDate: extra.shipDate,
      note: orNull(extra.note),
      lines: lines.map((line) => toAfterLine(line, row.status, imagesOf(line.id))),
      processedAt: extra.processedAt?.toISOString() ?? null,
      closeReason: extra.closeReason,
      closedAt: closedAtOf(row.status, extra.closedAt),
      voidReason: extra.voidReason,
      voidedAt: extra.voidedAt?.toISOString() ?? null,
      notice: row.status === 'processed' && !statement ? copy.after.processedNotice : null,
    }
  }
}
