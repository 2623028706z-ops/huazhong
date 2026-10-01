// 产品表单（06 章 X10）：名称、分类、单位、产品图、启用 → 配方明细（花材、用量）。
// 即时校验用和后端同一份 Zod 规则
import { productCreateSchema, productUpdateSchema, type ProductItem } from '@huazhong/shared'
import { checkedOf } from '../../../../core/form'
import { bomBodyOf, bomLinesOf, type BomLine } from '../../../../views/bom'

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
    bom: bomLinesOf(product.bom),
  }
}

function bodyOf(form: ProductForm) {
  const { name, categoryId, unit, imageFileId, enabled } = form
  const bom = bomBodyOf(form.bom)
  return { name, categoryId, unit, imageFileId, enabled, bom }
}

export function checkCreate(form: ProductForm) {
  return checkedOf(productCreateSchema.safeParse(bodyOf(form)))
}

export function checkUpdate(form: ProductForm, version: number) {
  return checkedOf(productUpdateSchema.safeParse({ ...bodyOf(form), version }))
}
