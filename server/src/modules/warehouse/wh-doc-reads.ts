// 手工入库、手工出库、报损：列表、详情、actions（05 章第 9 节、06 章 W4、W6、W7、W15）
import {
  appError,
  copy,
  type Action,
  type StatementRef,
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
  materials,
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
import { sumOf, unitTotalsOf } from '../../common/domain/units.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import {
  owns,
  sourceStatement,
  sourceStatements,
  statementLockedReason,
} from '../../common/statements.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { stocktakeBlocksVoid } from '../../common/stock-count.ts'
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
      counted: stocktakeBlocksVoid('wh', whDocs.id),
    })
    .from(whDocs)
    .leftJoin(suppliers, eq(suppliers.id, whDocs.supplierId))
    .leftJoin(outCategories, eq(outCategories.id, whDocs.outCategoryId))
    .innerJoin(accounts, eq(accounts.id, whDocs.createdBy))
    .leftJoin(voider, eq(voider.id, whDocs.voidedBy))
}
type DocRow = Awaited<ReturnType<typeof rowsQuery>>[number]
type Line = typeof whDocLines.$inferSelect & { code: string }

// 作废只允许登记人或管理员；手工入库入有效对账单后，改价和作废都禁用。
function actionsOf(row: DocRow, viewer: Viewer, statement: StatementRef | null): Action[] {
  const { doc } = row
  if (!viewer.modules.includes('warehouse') || doc.status === 'voided') return []
  const paidBlock = statement ? statementLockedReason(statement.no) : null
  const countBlock = row.counted ? copy.stock.voidAfterStocktake : null
  const voidAction = actionOf(
    'void',
    owns(viewer, doc.createdBy)
      ? ((doc.kind === 'in' ? paidBlock : null) ?? countBlock)
      : copy.stock.notCreator,
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
  async cardsOf(executor: Executor, viewer: Viewer, ids: number[]) {
    if (ids.length === 0) return []
    const rows = await rowsQuery(executor)
      .where(inArray(whDocs.id, ids))
      .orderBy(desc(whDocs.docDate), desc(whDocs.id))
    return this.cards(executor, viewer, rows)
  }

  private async cards(executor: Executor, viewer: Viewer, rows: DocRow[]): Promise<WhDocCard[]> {
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
    const statements = await sourceStatements(executor, 'wh', ids)
    return rows.map((row) =>
      cardOf(row, {
        viewer,
        lines: lines.filter((line) => line.docId === row.doc.id),
        repriced: repriced.has(row.doc.id),
        statement: statements.get(row.doc.id) ?? null,
      }),
    )
  }

  async detail(executor: Executor, viewer: Viewer, id: number): Promise<WhDocDetail> {
    const row = found((await rowsQuery(executor).where(eq(whDocs.id, id)))[0])
    // 纯财务只看手工入库单
    if (!viewer.modules.includes('warehouse') && row.doc.kind !== 'in') throw appError.notFound()
    const statement = await sourceStatement(executor, 'wh', id)
    const lines = await lineRows(executor, [id])
    const prices = await this.pricesOf(executor, id)
    const images = await this.imagesOf(executor, id)
    const card = cardOf(row, { viewer, lines, repriced: prices.length > 0, statement })
    return {
      ...card,
      reason: orNull(row.doc.reason),
      createdAt: row.doc.createdAt.toISOString(),
      lines: lines.map((line) => ({
        id: String(line.id),
        materialId: String(line.materialId),
        code: line.code,
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
        items: price.items.map(({ name, fromCents, toCents }) => ({ name, fromCents, toCents })),
      })),
      images,
      voidReason: row.doc.voidReason,
      voidedAt: row.doc.voidedAt?.toISOString() ?? null,
      voidedBy: row.voidedBy,
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
    statement: detail.statement,
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
  }
}

async function lineRows(executor: Executor, ids: number[]) {
  if (ids.length === 0) return []
  return executor
    .select({ line: whDocLines, code: materials.code })
    .from(whDocLines)
    .innerJoin(materials, eq(materials.id, whDocLines.materialId))
    .where(inArray(whDocLines.docId, ids))
    .orderBy(asc(whDocLines.sort), asc(whDocLines.id))
    .then((rows) => rows.map((row) => ({ ...row.line, code: row.code })))
}

function cardOf(
  row: DocRow,
  input: { viewer: Viewer; lines: Line[]; repriced: boolean; statement: StatementRef | null },
): WhDocCard {
  const { doc } = row
  const amountCents =
    doc.kind === 'in' ? sumOf(input.lines, (line) => line.qty * (line.priceCents ?? 0)) : null
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
    amountCents,
    statement: input.statement,
    repriced: input.repriced,
    actions: actionsOf(row, input.viewer, input.statement),
    lockedReason: lockedReasonOf(row),
  }
}
