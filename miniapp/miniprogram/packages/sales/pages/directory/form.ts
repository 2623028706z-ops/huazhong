// 订货目录的表单（06 章 X11）：每行产品、订货价、启用开关；只提交改过的和新加的行（接口「只改传了的项」）
import {
  catalogSaveSchema,
  copy,
  fieldsOf,
  type Catalog,
  type CatalogSave,
  type ProductItem,
} from '@huazhong/shared'
import { centsOfText, textOfCents } from '../../../../core/money'

export interface DirectoryRow {
  productId: string
  name: string
  meta: string
  priceText: string
  enabled: boolean
  // 新加进目录的没有版本号
  version: number | null
}

export function rowsOfCatalog(catalog: Catalog): DirectoryRow[] {
  return catalog.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    meta: item.productEnabled ? item.unit : [item.unit, copy.tag.disabled].join(copy.separator),
    priceText: textOfCents(item.listPriceCents),
    enabled: item.enabled,
    version: item.version,
  }))
}

export function rowOfProduct(product: ProductItem): DirectoryRow {
  return {
    productId: product.id,
    name: product.name,
    meta: product.unit,
    priceText: '',
    enabled: true,
    version: null,
  }
}

// 「添加产品」：启用、还不在目录里的产品
export function addableOf(products: readonly ProductItem[], rows: readonly DirectoryRow[]) {
  const added = new Set(rows.map((row) => row.productId))
  return products
    .filter((product) => product.enabled && !added.has(product.id))
    .map((product) => ({ id: product.id, name: product.name, sub: product.categoryName }))
}

function isSame(a: DirectoryRow | undefined, b: DirectoryRow): boolean {
  return a !== undefined && a.priceText === b.priceText && a.enabled === b.enabled
}

type Checked =
  { ok: true; body: CatalogSave } | { ok: false; errors: Record<string, string>; message: string }

// 行错误按页面上的行号给（提交的只是改过的行）
export function checkSave(
  initial: readonly DirectoryRow[],
  rows: readonly DirectoryRow[],
): Checked {
  const before = new Map(initial.map((row) => [row.productId, row]))
  const changed = rows.filter((row) => !isSame(before.get(row.productId), row))
  const items = changed.map((row) => ({
    productId: row.productId,
    priceCents: centsOfText(row.priceText),
    enabled: row.enabled,
    version: row.version ?? undefined,
  }))
  const parsed = catalogSaveSchema.safeParse({ items })
  if (parsed.success) return { ok: true, body: parsed.data }
  const fields = fieldsOf(parsed.error)
  const errors: Record<string, string> = {}
  changed.forEach((row, index) => {
    const message = fields[`items.${index}.priceCents`]
    if (message) errors[row.productId] = message
  })
  return { ok: false, errors, message: Object.values(fields)[0] ?? '' }
}
