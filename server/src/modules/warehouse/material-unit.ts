import { appError, copy } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import type { WriteContext } from '../../common/write.service.ts'
import {
  inviteLines,
  inviteSupplyLines,
  productBomLines,
  purchaseOrderLines,
  stockBatches,
  stockMoves,
  stocktakeLines,
  whDocLines,
} from '../../../db/schema/index.ts'

export async function guardMaterialUnit(ctx: WriteContext, id: number) {
  const tables = [
    stockBatches,
    stockMoves,
    stocktakeLines,
    whDocLines,
    purchaseOrderLines,
    inviteLines,
    inviteSupplyLines,
    productBomLines,
  ]
  const result = await ctx.tx.execute<{ used: boolean }>(
    sql`SELECT ${sql.join(
      tables.map((table) => sql`EXISTS (SELECT 1 FROM ${table} WHERE ${table.materialId} = ${id})`),
      sql` OR `,
    )} AS used`,
  )
  if (result.rows[0]?.used) throw appError.businessRule(copy.stock.unitInUse)
}
