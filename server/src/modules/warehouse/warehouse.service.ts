// 库存查询、花材分类（05 章第 3、9 节）。阶段 2 只读；库存 = 批次剩余合计（04 章第 8 节）
import {
  contract,
  MATERIAL_MANAGERS,
  type Action,
  type InventoryItem,
  type MaterialCategoryRow,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { WhDocReads } from './wh-doc-reads.ts'
import { materialCategories, materials, stockBatches } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { agedStockWhere } from './stock-age.ts'
import { DB } from '../../common/db.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { exactNumber } from '../../common/domain/units.ts'
import { afterCursor } from '../../common/page.ts'

// 新建 / 修改花材、管理花材分类：仓库 + 采购岗位和管理员（2026-10-06 第 4 批第 7 条）
export function canManageMaterials(viewer: Viewer): boolean {
  return MATERIAL_MANAGERS.some((key) => viewer.modules.includes(key))
}
export function materialManageActions(): Action[] {
  return [enabledAction('create', null), enabledAction('manageCategories', null)]
}

interface InventoryQuery {
  q?: string | undefined
  categoryId?: string | undefined
  cursor?: string | undefined
  limit: number
  aged?: boolean | undefined
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
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly docs: WhDocReads,
    private readonly clock: Clock,
  ) {}

  docCards(executor: Db | Tx, viewer: Viewer, ids: number[]) {
    return this.docs.cardsOf(executor, viewer, ids)
  }
  docDetail(executor: Db | Tx, viewer: Viewer, id: number) {
    return this.docs.detail(executor, viewer, id)
  }

  // 一种花材的当前库存（相关子查询，放在以 materials 为主表的查询里）
  private stockQtyOf(): SQL<number> {
    const total = this.db
      .select({ total: sql`coalesce(sum(${stockBatches.leftQty}), 0)` })
      .from(stockBatches)
      .where(eq(stockBatches.materialId, materials.id))
    return sql<number>`(${total})`.mapWith(exactNumber)
  }

  // 全部花材（含库存 0、含停用），按编码升序
  async listInventory(
    query: InventoryQuery,
    viewer?: Viewer,
  ): Promise<OutputOf<typeof contract.listInventory>> {
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
          query.aged === undefined
            ? undefined
            : query.aged
              ? agedStockWhere(this.clock.today())
              : sql`NOT (${agedStockWhere(this.clock.today())})`,
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
    return {
      items,
      nextCursor: page.nextCursor,
      actions: viewer && canManageMaterials(viewer) ? materialManageActions() : [],
    }
  }

  // 分类很少，不分页
  async listCategories(): Promise<OutputOf<typeof contract.listMaterialCategories>> {
    const rows = await this.db
      .select({
        id: materialCategories.id,
        name: materialCategories.name,
        sort: materialCategories.sort,
        materialCount: sql<number>`(
          SELECT count(*)::int FROM ${materials}
          WHERE ${materials.categoryId} = ${materialCategories.id} AND ${materials.enabled}
        )`,
      })
      .from(materialCategories)
      .orderBy(asc(materialCategories.sort), asc(materialCategories.id))
    const items: MaterialCategoryRow[] = rows.map((row) => ({ ...row, id: String(row.id) }))
    return { items, nextCursor: null, actions: [] }
  }
}
