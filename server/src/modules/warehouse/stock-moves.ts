import { contract, copy, type OutputOf } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { accounts, materials, stockBatches, stockMoves } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { beforeCursor, dateBetween } from '../../common/page.ts'

@Injectable()
export class StockMoves {
  constructor(@Inject(DB) private readonly db: Db) {}
  async list(
    query: ParsedInput<typeof contract.listStockMoves>['query'],
  ): Promise<OutputOf<typeof contract.listStockMoves>> {
    const rows = await this.db
      .select({
        move: stockMoves,
        materialName: materials.name,
        unit: materials.unit,
        inDate: stockBatches.inDate,
        actorName: accounts.name,
      })
      .from(stockMoves)
      .innerJoin(materials, eq(materials.id, stockMoves.materialId))
      .innerJoin(stockBatches, eq(stockBatches.id, stockMoves.batchId))
      .innerJoin(accounts, eq(accounts.id, stockMoves.createdBy))
      .where(
        and(
          query.type ? eq(stockMoves.type, query.type) : undefined,
          query.materialId ? eq(stockMoves.materialId, Number(query.materialId)) : undefined,
          dateBetween(stockMoves.movedAt, {
            from: query.from ? `${query.from}T00:00:00+08:00` : undefined,
            to: query.to ? `${query.to}T23:59:59.999+08:00` : undefined,
          }),
          beforeCursor(stockMoves.movedAt, stockMoves.id, query.cursor),
        ),
      )
      .orderBy(desc(stockMoves.movedAt), desc(stockMoves.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.move.movedAt.toISOString(), row.move.id])
    return {
      items: page.items.map((row) => ({
        id: String(row.move.id),
        movedAt: row.move.movedAt.toISOString(),
        type: row.move.type,
        materialId: String(row.move.materialId),
        materialName: row.materialName,
        unit: row.unit,
        qty: row.move.qty,
        batchLabel: copy.stock.batchLabel(row.inDate),
        docType: row.move.docType as 'po' | 'wh' | 'stocktake',
        docId: String(row.move.docId),
        docNo: row.move.docNo,
        actorName: row.actorName,
      })),
      nextCursor: page.nextCursor,
      actions: [],
    }
  }
}
