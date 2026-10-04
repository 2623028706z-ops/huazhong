import { appError, copy } from '@huazhong/shared'
import { sql, type SQLWrapper } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'

export function stocktakeBlocksVoid(docType: 'po' | 'wh', docId: number | SQLWrapper) {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM stock_moves m
    JOIN stocktake_lines c ON c.material_id = m.material_id AND c.last_move_id >= m.id
    WHERE m.doc_type = ${docType} AND m.doc_id = ${docId}
      AND m.type IN ('po_in', 'manual_in', 'manual_out', 'loss')
  )`
}

export async function guardStocktakeVoid(executor: Db | Tx, doc: { type: string; id: number }) {
  if (doc.type !== 'po' && doc.type !== 'wh') return
  const result = await executor.execute<{ blocked: boolean }>(
    sql`SELECT ${stocktakeBlocksVoid(doc.type, doc.id)} AS blocked`,
  )
  if (result.rows[0]?.blocked) throw appError.businessRule(copy.stock.voidAfterStocktake)
}
