// 配方明细的编辑（06 章 X10、X11）：产品表单和目录产品整页共用。只做数据换算，不发请求以外的事
import {
  contract,
  copy,
  PAGE_SIZE_MAX,
  type InventoryItem,
  type ProductItem,
} from '@huazhong/shared'
import { request, type Result } from '../core/request'

export interface BomLine {
  materialId: string
  name: string
  unit: string
  qty: number
}

export function bomLinesOf(bom: ProductItem['bom']): BomLine[] {
  return bom.map((line) => ({
    materialId: line.materialId,
    name: line.materialName,
    unit: line.unit,
    qty: line.qty,
  }))
}

export function bomTableRowsOf(bom: readonly BomLine[], materials: readonly InventoryItem[] = []) {
  return bom.map((line) => ({
    ...line,
    code: materials.find((item) => item.id === line.materialId)?.code ?? '',
    key: line.materialId,
    tags: [],
    removable: true,
  }))
}
export function bomBodyOf(bom: readonly BomLine[]) {
  return bom.map(({ materialId, qty }) => ({ materialId, qty }))
}

// 「添加花材」：还没在配方里的启用花材
export function materialPicksOf(materials: readonly InventoryItem[], bom: readonly BomLine[]) {
  const added = new Set(bom.map((line) => line.materialId))
  return materials
    .filter((item) => !added.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.name,
      sub: [`${copy.field.code} ${item.code}`, `${copy.field.unit} ${item.unit}`].join(
        copy.separator,
      ),
    }))
}

// 「添加花材」多选确认：勾选的花材一次加进配方，用量默认 1（已在配方里的跳过）
export function addMaterials(
  materials: readonly InventoryItem[],
  bom: BomLine[],
  ids: readonly string[],
): BomLine[] {
  const added = new Set(bom.map((line) => line.materialId))
  const lines = ids.flatMap((id) => {
    const item = materials.find((m) => m.id === id)
    if (!item || added.has(id)) return []
    return [{ materialId: item.id, name: item.name, unit: item.unit, qty: 1 }]
  })
  return [...bom, ...lines]
}

export function setBomQty(bom: readonly BomLine[], index: number, qty: number): BomLine[] {
  return bom.map((line, i) => (i === index ? { ...line, qty } : line))
}

export function removeBomLine(bom: readonly BomLine[], index: number): BomLine[] {
  return bom.filter((_, i) => i !== index)
}

// 配方只能选启用的花材：库存查询按页取全，去掉停用的
export async function loadMaterials(): Promise<Result<InventoryItem[]>> {
  const items: InventoryItem[] = []
  let cursor: string | undefined
  for (;;) {
    const result = await request(contract.listInventory, {
      query: { cursor, limit: PAGE_SIZE_MAX },
    })
    if (!result.ok) return result
    items.push(...result.data.items.filter((item) => item.enabled))
    if (result.data.nextCursor === null) return { ok: true, data: items }
    cursor = result.data.nextCursor
  }
}
