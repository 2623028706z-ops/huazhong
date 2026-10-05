// 订货目录（06 章 X11 / X13 / X14，2026-10-05 产品归客户）：右侧按这个客户的订货分类分组列产品；
// 点一行进目录产品整页（产品图、名称、单位 → 订货信息 → 配方明细），新建和修改同一页
import {
  catalogItemCreateSchema,
  catalogItemUpdateSchema,
  copy,
  formatMoney,
  type Catalog,
  type CatalogCopySource,
  type CatalogItem,
} from '@huazhong/shared'
import { checkedOf } from '../../../../core/form'
import { centsOfText, textOfCents } from '../../../../core/money'
import { bomBodyOf, bomLinesOf, type BomLine } from '../../../../views/bom'

// 行：名称（+ 已停用）、订货价/单位靠右；小字客户产品编码、配方几种花材
function rowOf(item: CatalogItem) {
  return {
    productId: item.productId,
    name: item.name,
    disabled: !item.enabled,
    code: item.customerCode ? `${copy.screen.label.customerCode} ${item.customerCode}` : '',
    bom: copy.screen.bomCount(item.bom.length),
    priceText: copy.screen.pricePer(formatMoney(item.listPriceCents), item.unit),
  }
}

// 只列有产品的分类（空分类在「管理分类」里看得到）
export function groupsOf(catalog: Catalog) {
  return catalog.categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      rows: catalog.items.filter((item) => item.categoryId === category.id).map(rowOf),
    }))
    .filter((group) => group.rows.length > 0)
}

export interface ItemForm {
  name: string
  unit: string
  imageFileId: string | null
  imageUrl: string
  categoryId: string
  customerCode: string
  priceText: string
  enabled: boolean
  bom: BomLine[]
}

export function formOfItem(item: CatalogItem): ItemForm {
  return {
    name: item.name,
    unit: item.unit,
    imageFileId: item.imageFileId,
    imageUrl: item.imageUrl ?? '',
    categoryId: item.categoryId,
    customerCode: item.customerCode,
    priceText: textOfCents(item.listPriceCents),
    enabled: item.enabled,
    bom: bomLinesOf(item.bom),
  }
}

// 新建：只有一个订货分类时默认选它
export function blankForm(catalog: Catalog): ItemForm {
  const [only, ...rest] = catalog.categories
  return {
    name: '',
    unit: '',
    imageFileId: null,
    imageUrl: '',
    categoryId: only && rest.length === 0 ? only.id : '',
    customerCode: '',
    priceText: '',
    enabled: true,
    bom: [],
  }
}

function bodyOf(form: ItemForm) {
  const { name, unit, imageFileId, categoryId, customerCode, enabled } = form
  const priceCents = centsOfText(form.priceText)
  return {
    name,
    unit,
    imageFileId,
    categoryId,
    customerCode,
    priceCents,
    enabled,
    bom: bomBodyOf(form.bom),
  }
}

export function checkCreate(form: ItemForm) {
  return checkedOf(catalogItemCreateSchema.safeParse(bodyOf(form)))
}

export function checkUpdate(form: ItemForm, version: number) {
  return checkedOf(catalogItemUpdateSchema.safeParse({ ...bodyOf(form), version }))
}

// 从其他客户复制：一行一个来源产品，单位 · 配方摘要；重名、停用的不能勾，写明原因
export function copyRowsOf(source: CatalogCopySource, picked: readonly string[]) {
  return source.items.map((item) => {
    const bom = item.bom
      .map((line) => `${line.materialName} ${line.qty}`)
      .join(copy.order.nameSeparator)
    const skip =
      item.skipReason === 'duplicate'
        ? copy.screen.catalog.skipDuplicate
        : item.skipReason === 'disabled'
          ? copy.screen.catalog.skipDisabled
          : ''
    return {
      id: item.productId,
      name: item.name,
      sub: skip || [item.unit, bom].filter(Boolean).join(copy.separator),
      disabled: skip !== '',
      picked: picked.includes(item.productId),
    }
  })
}
