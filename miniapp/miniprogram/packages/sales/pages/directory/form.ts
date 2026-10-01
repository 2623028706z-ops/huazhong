// 订货目录（06 章 X11，2026-10-03 确认）：右侧按这个客户的订货分类分组列目录项；点一项弹层，
// 上块「订货信息」（客户产品编码、订货分类、订货价、可订），下块配方（产品本身的，所有客户共用），一起保存
import {
  catalogItemSaveSchema,
  copy,
  formatMoney,
  type Catalog,
  type CatalogItem,
  type CatalogItemSave,
  type ProductItem,
} from '@huazhong/shared'
import { checkedOf, type Checked } from '../../../../core/form'
import { centsOfText, textOfCents } from '../../../../core/money'
import { bomBodyOf, bomLinesOf, type BomLine } from '../../../../views/bom'

interface Tag {
  text: string
  warn: boolean
}

function rowOf(item: CatalogItem) {
  // 02 章 hz-tag：「已停订」是警告，「已停用」普通
  const tags: Tag[] = []
  if (!item.enabled) tags.push({ text: copy.screen.tag.discontinued, warn: true })
  if (!item.productEnabled) tags.push({ text: copy.tag.disabled, warn: false })
  // 行上只放名称、订货价，第二行标记 + 编码（都没有就不出第二行）；配方只在弹层里看
  return {
    productId: item.productId,
    name: item.name,
    tags,
    code: item.customerCode,
    priceText: copy.screen.pricePer(formatMoney(item.listPriceCents), item.unit),
  }
}

// 只列有目录项的分类（空分类在「管理分类」里看得到）
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
  productId: string
  name: string
  unit: string
  // 新加进目录的为 null
  version: number | null
  productVersion: number
  categoryId: string
  customerCode: string
  priceText: string
  enabled: boolean
  bom: BomLine[]
}

export function formOfItem(item: CatalogItem): ItemForm {
  return {
    productId: item.productId,
    name: item.name,
    unit: item.unit,
    version: item.version,
    productVersion: item.productVersion,
    categoryId: item.categoryId,
    customerCode: item.customerCode,
    priceText: textOfCents(item.listPriceCents),
    enabled: item.enabled,
    bom: bomLinesOf(item.bom),
  }
}

// 新加进目录：只有一个分类时默认选它
export function formOfProduct(product: ProductItem, catalog: Catalog): ItemForm {
  const [only, ...rest] = catalog.categories
  return {
    productId: product.id,
    name: product.name,
    unit: product.unit,
    version: null,
    productVersion: product.version,
    categoryId: only && rest.length === 0 ? only.id : '',
    customerCode: '',
    priceText: '',
    enabled: true,
    bom: bomLinesOf(product.bom),
  }
}

export function bomChanged(form: ItemForm, initial: ItemForm): boolean {
  return JSON.stringify(bomBodyOf(form.bom)) !== JSON.stringify(bomBodyOf(initial.bom))
}

// 配方改了才带 product；报错键：categoryId、customerCode、priceCents、product.bom…
export function checkItem(form: ItemForm, initial: ItemForm): Checked<CatalogItemSave> {
  return checkedOf(
    catalogItemSaveSchema.safeParse({
      version: form.version ?? undefined,
      categoryId: form.categoryId,
      customerCode: form.customerCode,
      priceCents: centsOfText(form.priceText),
      enabled: form.enabled,
      product: bomChanged(form, initial)
        ? { version: form.productVersion, bom: bomBodyOf(form.bom) }
        : undefined,
    }),
  )
}

// 「添加产品」：启用、还不在这个客户目录里的产品
export function addableOf(products: readonly ProductItem[], catalog: Catalog) {
  const added = new Set(catalog.items.map((item) => item.productId))
  return products
    .filter((product) => product.enabled && !added.has(product.id))
    .map((product) => ({ id: product.id, name: product.name, sub: product.categoryName }))
}
