import {
  contract,
  MATERIAL_CODE_DIGITS,
  MATERIAL_CODE_PREFIX,
  type Material,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { materialCategories, materials, stockBatches } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { afterCursor } from '../../common/page.ts'
import { found } from '../../common/scope.ts'
import { materialSearch, WarehouseService } from './warehouse.service.ts'

type Executor = Db | Tx
function materialRows(executor: Executor, where?: SQL) {
  return executor
    .select({
      id: materials.id,
      version: materials.version,
      code: materials.code,
      name: materials.name,
      categoryId: materials.categoryId,
      categoryName: materialCategories.name,
      unit: materials.unit,
      enabled: materials.enabled,
    })
    .from(materials)
    .innerJoin(materialCategories, eq(materialCategories.id, materials.categoryId))
    .where(where)
}
function toMaterial(row: Awaited<ReturnType<typeof materialRows>>[number]): Material {
  return { ...row, id: String(row.id), categoryId: String(row.categoryId) }
}
export async function nextMaterialCode(executor: Executor) {
  const pattern = `^${MATERIAL_CODE_PREFIX}[0-9]+$`
  const [row] = await executor
    .select({
      last: sql<number>`coalesce(max(substring(${materials.code} from '[0-9]+$')::bigint), 0)`.mapWith(
        Number,
      ),
    })
    .from(materials)
    .where(sql`${materials.code} ~ ${pattern}`)
  return `${MATERIAL_CODE_PREFIX}${String((row?.last ?? 0) + 1).padStart(MATERIAL_CODE_DIGITS, '0')}`
}
async function batchesOf(executor: Executor, ids: number[]) {
  if (ids.length === 0) return []
  return executor
    .select()
    .from(stockBatches)
    .where(inArray(stockBatches.materialId, ids))
    .orderBy(asc(stockBatches.inDate), asc(stockBatches.id))
}
function batchView(row: typeof stockBatches.$inferSelect) {
  return { id: String(row.id), inDate: row.inDate, qty: row.qty, leftQty: row.leftQty }
}
@Injectable()
export class MaterialReads {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly warehouse: WarehouseService,
  ) {}
  async item(executor: Executor, id: number) {
    return toMaterial(found((await materialRows(executor, eq(materials.id, id)))[0]))
  }
  async detail(id: number): Promise<OutputOf<typeof contract.getMaterial>> {
    const item = await this.item(this.db, id)
    const batches = await batchesOf(this.db, [id])
    return {
      ...item,
      stockQty: batches.reduce((sum, row) => sum + row.leftQty, 0),
      batches: batches.map(batchView),
    }
  }
  async list(
    viewer: Viewer,
    query: ParsedInput<typeof contract.listMaterials>['query'],
  ): Promise<OutputOf<typeof contract.listMaterials>> {
    const rows = await materialRows(
      this.db,
      and(
        materialSearch(query.q),
        query.categoryId ? eq(materials.categoryId, Number(query.categoryId)) : undefined,
        query.enabled ? eq(materials.enabled, query.enabled === 'true') : undefined,
        afterCursor(materials.code, materials.id, query.cursor),
      ),
    )
      .orderBy(asc(materials.code), asc(materials.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.code, row.id])
    return {
      items: page.items.map(toMaterial),
      nextCursor: page.nextCursor,
      nextCode: await nextMaterialCode(this.db),
      actions: viewer.modules.includes('warehouse')
        ? [enabledAction('create', null), enabledAction('manageCategories', null)]
        : [],
    }
  }
  async supplier(
    query: ParsedInput<typeof contract.supplierMaterials>['query'],
  ): Promise<OutputOf<typeof contract.supplierMaterials>> {
    const rows = await materialRows(
      this.db,
      and(
        eq(materials.enabled, true),
        materialSearch(query.q),
        afterCursor(materials.code, materials.id, query.cursor),
      ),
    )
      .orderBy(asc(materials.code), asc(materials.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.code, row.id])
    return {
      items: page.items.map((row) => ({ id: String(row.id), name: row.name, unit: row.unit })),
      nextCursor: page.nextCursor,
      actions: [],
    }
  }
  async stock(
    query: ParsedInput<typeof contract.warehouseStock>['query'],
  ): Promise<OutputOf<typeof contract.warehouseStock>> {
    const page = await this.warehouse.listInventory(query)
    const batches = await batchesOf(
      this.db,
      page.items.map((row) => Number(row.id)),
    )
    return {
      ...page,
      items: page.items.map((row) => ({
        ...row,
        batches: batches.filter((batch) => String(batch.materialId) === row.id).map(batchView),
        actions: [],
      })),
    }
  }
}
