// 订单表单（06 章 X4）：新建、修改、修改并确认共用。新加的行单价默认目录价，原有行保持原单价；
// 即时校验用和后端同一份 Zod 规则，提交结果以后端为准
import {
  SHIP_DATE_DEFAULT_OFFSET_DAYS,
  addDays,
  copy,
  contract,
  type InputOf,
  formatMoney,
  orderCreateSchema,
  orderUpdateSchema,
  shanghaiDateOf,
  type CatalogItem,
  type OrderCreate,
  type OrderDetail,
  type OrderUpdate,
} from '@huazhong/shared'
import { centsOfText, lineCents, textOfCents } from '../../../../core/money'
import { checkedOf, type Checked } from '../../../../core/form'

export type FormMode = 'create' | 'edit' | 'confirm'

export interface FormLine {
  productId: string
  name: string
  code?: string
  unit: string
  qty: number
  priceText: string
  discontinued: boolean
}

export interface OrderForm {
  customerId: string
  storeId: string
  shipDate: string
  note: string
  reason: string
  lines: FormLine[]
}

function defaultShipDate(): string {
  return addDays(shanghaiDateOf(Date.now()), SHIP_DATE_DEFAULT_OFFSET_DAYS)
}

export function blankForm(): OrderForm {
  return {
    customerId: '',
    storeId: '',
    shipDate: defaultShipDate(),
    note: '',
    reason: '',
    lines: [],
  }
}

// 待确认的门店单没有出货日期：修改并确认时默认今天往后几天
export function formOf(order: OrderDetail, reason: string): OrderForm {
  return {
    customerId: order.customerId,
    storeId: order.storeId,
    shipDate: order.shipDate ?? defaultShipDate(),
    note: order.note ?? '',
    reason,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      name: line.name,
      code: line.customerCode,
      unit: line.unit,
      qty: line.qty,
      priceText: textOfCents(line.priceCents),
      discontinued: line.discontinued,
    })),
  }
}

export function lineOfCatalog(item: CatalogItem): FormLine {
  return {
    productId: item.productId,
    name: item.name,
    code: item.customerCode,
    unit: item.unit,
    qty: 1,
    priceText: textOfCents(item.listPriceCents),
    discontinued: false,
  }
}

// 「添加产品」只列这个客户目录里启用、还没加的产品
export function addableOf(catalog: readonly CatalogItem[], lines: readonly FormLine[]) {
  const added = new Set(lines.map((line) => line.productId))
  return catalog
    .filter((item) => item.enabled && item.productEnabled && !added.has(item.productId))
    .map((item) => ({ id: item.productId, name: item.name, sub: formatMoney(item.listPriceCents) }))
}

function lineCentsOf(line: FormLine): number {
  return lineCents(line.qty, centsOfText(line.priceText))
}

export function lineViewsOf(lines: readonly FormLine[]) {
  return lines.map((line) => ({
    key: line.productId,
    name: line.name,
    code: line.code,
    tags: line.discontinued ? [{ text: copy.screen.tag.discontinued, warn: true }] : [],
    amountCents: lineCentsOf(line),
    qty: line.qty,
    unit: line.unit,
    priceCents: centsOfText(line.priceText) ?? 0,
    priceText: line.priceText,
  }))
}

function bodyLinesOf(lines: readonly FormLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    qty: line.qty,
    priceCents: centsOfText(line.priceText),
  }))
}

export function checkCreate(form: OrderForm): Checked<OrderCreate> {
  const { customerId, storeId, shipDate, note } = form
  const lines = bodyLinesOf(form.lines)
  return checkedOf(orderCreateSchema.safeParse({ customerId, storeId, shipDate, note, lines }))
}

export function checkUpdate(form: OrderForm, version: number): Checked<OrderUpdate> {
  const { shipDate, note, reason } = form
  const lines = bodyLinesOf(form.lines)
  return checkedOf(orderUpdateSchema.safeParse({ version, shipDate, note, reason, lines }))
}

export function linesChanged(form: OrderForm, initial: OrderForm): boolean {
  const snapshot = (value: OrderForm) =>
    bodyLinesOf(value.lines).sort((a, b) => a.productId.localeCompare(b.productId))
  return JSON.stringify(snapshot(form)) !== JSON.stringify(snapshot(initial))
}
export function checkConfirm(
  form: OrderForm,
  initial: OrderForm,
  version: number,
): Checked<InputOf<typeof contract.confirmOrder>['body']> {
  if (linesChanged(form, initial) && !form.reason.trim())
    return { ok: false, fields: { reason: copy.order.editReasonRequired } }
  return checkedOf(
    contract.confirmOrder.body.safeParse({
      version,
      shipDate: form.shipDate,
      note: form.note,
      lines: bodyLinesOf(form.lines),
      reason: form.reason || undefined,
    }),
  )
}
