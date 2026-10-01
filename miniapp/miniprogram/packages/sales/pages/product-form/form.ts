// 产品表单（06 章 X10）：名称、分类、单位、产品图、启用 → 配方明细（花材、用量）。
// 即时校验用和后端同一份 Zod 规则
import {
  contract,
  PAGE_SIZE_MAX,
  productCreateSchema,
  productUpdateSchema,
  type InventoryItem,
  type ProductItem,
} from '@huazhong/shared'
import { request, type Result } from '../../../../core/request'
import { checkedOf } from '../../../../core/form'

interface BomLine {
  materialId: string
  name: string
  unit: string
  qty: number
}

export interface ProductForm {
  name: string
  categoryId: string
  unit: string
  imageFileId: string | null
  imageUrl: string
  enabled: boolean
  bom: BomLine[]
}

const blankProduct: ProductForm = {
  name: '',
  categoryId: '',
  unit: '',
  imageFileId: null,
  imageUrl: '',
  enabled: true,
  bom: [],
}

export function productFormOf(product: ProductItem | null): ProductForm {
  if (!product) return blankProduct
  const { name, categoryId, unit, imageFileId, enabled } = product
  return {
    name,
    categoryId,
    unit,
    imageFileId,
    imageUrl: product.imageUrl ?? '',
    enabled,
    bom: product.bom.map((line) => ({
      materialId: line.materialId,
      name: line.materialName,
      unit: line.unit,
      qty: line.qty,
    })),
  }
}

function bodyOf(form: ProductForm) {
  const { name, categoryId, unit, imageFileId, enabled } = form
  const bom = form.bom.map(({ materialId, qty }) => ({ materialId, qty }))
  return { name, categoryId, unit, imageFileId, enabled, bom }
}

export function checkCreate(form: ProductForm) {
  return checkedOf(productCreateSchema.safeParse(bodyOf(form)))
}

export function checkUpdate(form: ProductForm, version: number) {
  return checkedOf(productUpdateSchema.safeParse({ ...bodyOf(form), version }))
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
