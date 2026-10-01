// 产品配方明细：产品列表和订货目录共用（05 章第 4 节），按录入顺序
import type { ProductItem } from '@huazhong/shared'
import { asc, eq, inArray } from 'drizzle-orm'
import { materials, productBomLines } from '../../../db/schema/index.ts'
import type { Executor } from './order-rows.ts'

type BomLine = ProductItem['bom'][number]

export async function bomLinesOf(
  executor: Executor,
  productIds: readonly number[],
): Promise<Map<number, BomLine[]>> {
  const byProduct = new Map<number, BomLine[]>()
  if (productIds.length === 0) return byProduct
  const rows = await executor
    .select({
      productId: productBomLines.productId,
      materialId: productBomLines.materialId,
      materialName: materials.name,
      unit: materials.unit,
      qty: productBomLines.qty,
      materialEnabled: materials.enabled,
    })
    .from(productBomLines)
    .innerJoin(materials, eq(materials.id, productBomLines.materialId))
    .where(inArray(productBomLines.productId, [...productIds]))
    .orderBy(asc(productBomLines.id))
  for (const { productId, ...line } of rows) {
    const lines = byProduct.get(productId) ?? []
    lines.push({ ...line, materialId: String(line.materialId) })
    byProduct.set(productId, lines)
  }
  return byProduct
}
