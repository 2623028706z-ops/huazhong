// 手工入库、手工出库、报损：列表、详情、actions（05 章第 9 节、06 章 W4、W6、W7、W15）
import {
  appError,
  shanghaiDateOf,
  copy,
  type Action,
  type OutputOf,
  type WhDocCard,
  type WhDocDetail,
  type contract,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db, Tx } from '../../../db/client.ts'
import {
  accounts,
  outCategories,
  priceChanges,
  suppliers,
  whDocImages,
  whDocLines,
  whDocs,
} from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { actionOf } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { orNull } from '../../common/domain/text.ts'
import { unitTotalsOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { paymentHistory } from '../../common/finance-history.ts'
import { owns } from '../../common/ledger.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { apStatusOf, loadPaymentLedger, type PaymentLedger } from '../../common/payment-ledger.ts'
import { found } from '../../common/scope.ts'
import { FilesService } from '../files/files.service.ts'

type Executor = Db | Tx
const voider = alias(accounts, 'voider')
function rowsQuery(executor: Executor) {
  return executor
    .select({
      doc: whDocs,
      supplierName: suppliers.name,
      outCategoryName: outCategories.name,
      actorName: accounts.name,
      voidedBy: voider.name,
    })
    .from(whDocs)
    .leftJoin(suppliers, eq(suppliers.id, whDocs.supplierId))
    .leftJoin(outCategories, eq(outCategories.id, whDocs.outCategoryId))
    .innerJoin(accounts, eq(accounts.id, whDocs.createdBy))
    .leftJoin(voider, eq(voider.id, whDocs.voidedBy))
}
type DocRow = Awaited<ReturnType<typeof rowsQuery>>[number]
type Line = typeof whDocLines.$inferSelect

// 作废要录的人或管理员；手工入库已付（核销实际抵到钱）时改单价、作废都禁用（2026-10-03 确认）
function actionsOf(row: DocRow, viewer: Viewer, paid: boolean): Action[] {
  const { doc } = row
  if (!viewer.modules.includes('warehouse') || doc.status === 'voided') return []
  const paidBlock = paid ? copy.stock.voidPaid : null
  const voidAction = actionOf(
    'void',
    owns(viewer, doc.createdBy) ? (doc.kind === 'in' ? paidBlock : null) : copy.stock.notCreator,
    true,
  )
  return doc.kind === 'in' ? [voidAction, actionOf('reprice', paidBlock, true)] : [voidAction]
}
function lockedReasonOf(row: DocRow): string | null {
  if (row.doc.status !== 'voided') return null
  return row.doc.kind === 'in' ? copy.stock.voidedNoReprice : copy.stock.voided
}

@Injectable()
export class WhDocReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly files: FilesService,
  ) {}

  async list(
    viewer: Viewer,
    query: ParsedInput<typeof contract.listWhDocs>['query'],
  ): Promise<OutputOf<typeof contract.listWhDocs>> {
    const conditions: (SQL | undefined)[] = [
      eq(whDocs.kind, query.kind),
      query.status ? eq(whDocs.status, query.status) : undefined,
      query.supplierId ? eq(whDocs.supplierId, Number(query.supplierId)) : undefined,
      query.outCategoryId ? eq(whDocs.outCategoryId, Number(query.outCategoryId)) : undefined,
      dateBetween(whDocs.docDate, query),
      beforeCursor(whDocs.docDate, whDocs.id, query.cursor),
    ]
    return this.db.transaction(
      async (tx) => {
        const rows = await rowsQuery(tx)
          .where(and(...conditions))
          .orderBy(desc(whDocs.docDate), desc(whDocs.id))
          .limit(query.limit + 1)
        const page = pageOf(rows, query.limit, (row) => [row.doc.docDate, row.doc.id])
        return {
          items: await this.cards(tx, viewer, page.items),
          nextCursor: page.nextCursor,
          counts: {},
          actions: viewer.modules.includes('warehouse') ? [actionOf('create', null, null)] : [],
        }
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }

  // 财务应付里的手工入库单卡片（同一供应商，账本已载入）
  async cardsOf(executor: Executor, viewer: Viewer, ids: number[], ledger?: PaymentLedger) {
    if (ids.length === 0) return []
    const rows = await rowsQuery(executor)
      .where(inArray(whDocs.id, ids))
      .orderBy(desc(whDocs.docDate), desc(whDocs.id))
    return this.cards(executor, viewer, rows, ledger)
  }

  private async cards(
    executor: Executor,
    viewer: Viewer,
    rows: DocRow[],
    given?: PaymentLedger,
  ): Promise<WhDocCard[]> {
    const ids = rows.map((row) => row.doc.id)
    const lines = await lineRows(executor, ids)
    const repriced = new Set(
      ids.length === 0
        ? []
        : (
            await executor
              .select({ id: priceChanges.whDocId })
              .from(priceChanges)
              .where(inArray(priceChanges.whDocId, ids))
          ).map((row) => row.id),
    )
    const ledgers = new Map<number, PaymentLedger>()
    if (given) ledgers.set(given.supplierId, given)
    for (const row of rows) {
      const supplierId = row.doc.supplierId
      if (supplierId !== null && !ledgers.has(supplierId))
        ledgers.set(supplierId, await loadPaymentLedger(executor, supplierId))
    }
    return rows.map((row) =>
      cardOf(row, {
        viewer,
        lines: lines.filter((line) => line.docId === row.doc.id),
        repriced: repriced.has(row.doc.id),
        ledger: row.doc.supplierId === null ? null : found(ledgers.get(row.doc.supplierId)),
      }),
    )
  }

  async detail(executor: Executor, viewer: Viewer, id: number): Promise<WhDocDetail> {
    const row = found((await rowsQuery(executor).where(eq(whDocs.id, id)))[0])
    // 纯财务只看手工入库单
    if (!viewer.modules.includes('warehouse') && row.doc.kind !== 'in') throw appError.notFound()
    const ledger =
      row.doc.supplierId === null ? null : await loadPaymentLedger(executor, row.doc.supplierId)
    const lines = await lineRows(executor, [id])
    const prices = await this.pricesOf(executor, id)
    const images = await this.imagesOf(executor, id)
    const card = cardOf(row, { viewer, lines, repriced: prices.length > 0, ledger })
    return {
      ...card,
      reason: orNull(row.doc.reason),
      createdAt: row.doc.createdAt.toISOString(),
      lines: lines.map((line) => ({
        id: String(line.id),
        materialId: String(line.materialId),
        name: line.name,
        unit: line.unit,
        qty: line.qty,
        priceCents: line.priceCents,
        amountCents: line.priceCents === null ? null : line.qty * line.priceCents,
      })),
      priceChanges: prices.map((price) => ({
        id: String(price.id),
        actorLabel: price.actorLabel,
        createdAt: price.createdAt.toISOString(),
        reason: price.reason,
        items: price.items,
      })),
      images,
      voidReason: row.doc.voidReason,
      voidedAt: row.doc.voidedAt?.toISOString() ?? null,
      voidedBy: row.voidedBy,
      allocations: ledger
        ? (await paymentHistory(executor, ledger, viewer)).filter(
            (item) => item.docType === 'wh' && item.docId === String(id),
          )
        : [],
    }
  }

  private pricesOf(executor: Executor, id: number) {
    return executor
      .select()
      .from(priceChanges)
      .where(eq(priceChanges.whDocId, id))
      .orderBy(asc(priceChanges.createdAt), asc(priceChanges.id))
  }

  private async imagesOf(executor: Executor, id: number) {
    const images = await executor
      .select()
      .from(whDocImages)
      .where(eq(whDocImages.docId, id))
      .orderBy(asc(whDocImages.sort), asc(whDocImages.id))
    const urls = await this.files.urlsOf(
      executor,
      images.map((image) => image.fileId),
    )
    return images.map((image) => ({
      fileId: String(image.fileId),
      ...found(urls.get(image.fileId)),
    }))
  }

  detailRead(viewer: Viewer, id: number) {
    return this.db.transaction((tx) => this.detail(tx, viewer, id), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })
  }

  async supplier(
    viewer: Viewer,
    id: number,
  ): Promise<OutputOf<typeof contract.getSupplierStockIn>> {
    return this.db.transaction(
      async (tx) => {
        const [doc] = await tx
          .select()
          .from(whDocs)
          .where(
            and(
              eq(whDocs.id, id),
              eq(whDocs.kind, 'in'),
              eq(whDocs.supplierId, viewer.supplierId ?? 0),
            ),
          )
        found(doc)
        const detail = await this.detail(tx, viewer, id)
        return supplierViewOf(detail)
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    )
  }
}

function supplierViewOf(detail: WhDocDetail): OutputOf<typeof contract.getSupplierStockIn> {
  return {
    id: detail.id,
    no: detail.no,
    version: detail.version,
    kind: detail.kind,
    status: detail.status,
    docDate: detail.docDate,
    supplierId: detail.supplierId,
    supplierName: detail.supplierName,
    materials: detail.materials,
    units: detail.units,
    actorName: detail.actorName,
    amountCents: detail.amountCents,
    paidCents: detail.paidCents,
    unpaidCents: detail.unpaidCents,
    apStatus: detail.apStatus,
    repriced: detail.repriced,
    actions: detail.actions,
    lockedReason: detail.lockedReason,
    reason: detail.reason,
    createdAt: detail.createdAt,
    lines: detail.lines,
    priceChanges: detail.priceChanges,
    voidReason: detail.voidReason,
    voidedAt: detail.voidedAt,
    voidedBy: detail.voidedBy,
    title: copy.stock.supplierStockIn,
    allocations: detail.allocations
      .filter((row) => row.status === 'valid' && row.effectiveCents > 0)
      .map((row) => ({
        date: shanghaiDateOf(Date.parse(row.createdAt)),
        amountCents: row.effectiveCents,
      })),
  }
}

async function lineRows(executor: Executor, ids: number[]) {
  if (ids.length === 0) return []
  return executor
    .select()
    .from(whDocLines)
    .where(inArray(whDocLines.docId, ids))
    .orderBy(asc(whDocLines.sort), asc(whDocLines.id))
}

function cardOf(
  row: DocRow,
  input: { viewer: Viewer; lines: Line[]; repriced: boolean; ledger: PaymentLedger | null },
): WhDocCard {
  const { doc } = row
  const financial = financialOf(doc, input.lines, input.ledger)
  const live = (financial.paidCents ?? 0) > 0
  return {
    id: String(doc.id),
    no: doc.no,
    version: doc.version,
    kind: doc.kind,
    status: doc.status,
    docDate: doc.docDate,
    supplierId: doc.supplierId === null ? null : String(doc.supplierId),
    supplierName: row.supplierName,
    outCategoryId: doc.outCategoryId === null ? null : String(doc.outCategoryId),
    outCategoryName: row.outCategoryName,
    materials: input.lines.map((line) => ({ name: line.name, qty: line.qty })),
    units: unitTotalsOf(input.lines),
    actorName: row.actorName,
    ...financial,
    repriced: input.repriced,
    actions: actionsOf(row, input.viewer, live),
    lockedReason: lockedReasonOf(row),
  }
}

function financialOf(doc: typeof whDocs.$inferSelect, lines: Line[], ledger: PaymentLedger | null) {
  const amountCents =
    doc.kind === 'in'
      ? lines.reduce((sum, line) => sum + line.qty * (line.priceCents ?? 0), 0)
      : null
  if (amountCents === null || doc.status === 'voided')
    return { amountCents, paidCents: null, unpaidCents: null, apStatus: null }
  const paidCents = ledger?.replay.received.get(`wh:${doc.id}`) ?? 0
  const amounts = {
    payableCents: amountCents,
    paidCents,
    unpaidCents: Math.max(amountCents - paidCents, 0),
  }
  return { amountCents, paidCents, unpaidCents: amounts.unpaidCents, apStatus: apStatusOf(amounts) }
}
