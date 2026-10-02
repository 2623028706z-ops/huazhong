// 库存查询、花材分类（05 章第 3、9 节）。阶段 2 只读；库存 = 批次剩余合计（04 章第 8 节）
import {
  contract,
  type InventoryItem,
  type MaterialCategory,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { materialCategories, materials, stockBatches } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { afterCursor } from '../../common/page.ts'

interface InventoryQuery {
  q?: string | undefined
  categoryId?: string | undefined
  cursor?: string | undefined
  limit: number
}

// 搜索词里的 % _ \ 当普通字符
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export function materialSearch(q: string | undefined): SQL | undefined {
  if (!q) return undefined
  const pattern = likePattern(q)
  return or(ilike(materials.name, pattern), ilike(materials.code, pattern))
}

@Injectable()
export class WarehouseService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // 一种花材的当前库存（相关子查询，放在以 materials 为主表的查询里）
  private stockQtyOf(): SQL<number> {
    const total = this.db
      .select({ total: sql<number>`coalesce(sum(${stockBatches.leftQty}), 0)::int` })
      .from(stockBatches)
      .where(eq(stockBatches.materialId, materials.id))
    return sql<number>`(${total})`
  }

  // 全部花材（含库存 0、含停用），按编码升序
  async listInventory(query: InventoryQuery): Promise<OutputOf<typeof contract.listInventory>> {
    const rows = await this.db
      .select({
        id: materials.id,
        code: materials.code,
        name: materials.name,
        categoryId: materials.categoryId,
        categoryName: materialCategories.name,
        unit: materials.unit,
        enabled: materials.enabled,
        stockQty: this.stockQtyOf(),
      })
      .from(materials)
      .innerJoin(materialCategories, eq(materialCategories.id, materials.categoryId))
      .where(
        and(
          materialSearch(query.q),
          query.categoryId === undefined
            ? undefined
            : eq(materials.categoryId, Number(query.categoryId)),
          afterCursor(materials.code, materials.id, query.cursor),
        ),
      )
      .orderBy(asc(materials.code), asc(materials.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.code, row.id])
    const items: InventoryItem[] = page.items.map((row) => ({
      ...row,
      id: String(row.id),
      categoryId: String(row.categoryId),
    }))
    return { items, nextCursor: page.nextCursor, actions: [] }
  }

  // 分类很少，不分页
  async listCategories(): Promise<OutputOf<typeof contract.listMaterialCategories>> {
    const rows = await this.db
      .select({
        id: materialCategories.id,
        name: materialCategories.name,
        sort: materialCategories.sort,
      })
      .from(materialCategories)
      .orderBy(asc(materialCategories.sort), asc(materialCategories.id))
    const items: MaterialCategory[] = rows.map((row) => ({ ...row, id: String(row.id) }))
    return { items, nextCursor: null, actions: [] }
  }
}
