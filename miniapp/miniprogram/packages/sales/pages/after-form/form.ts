// 售后表单（06 章 X7）：处理（门店提交的，只改数量和单价，原因、说明、图片只读）和新建（每行数量、单价、
// 问题原因必选、问题说明选填，没有图片）。单价默认发货单价，只能改低；即时校验用和后端同一份 Zod 规则
import {
  afterCreateSchema,
  afterProcessSchema,
  copy,
  formatMoney,
  labels,
  type AfterCreate,
  type AfterDetail,
  type AfterProcess,
  type OrderLine,
} from '@huazhong/shared'
import { centsOfText, lineCents, sumCents, textOfCents } from '../../../../core/money'
import { checkedOf, formTotalOf, type Checked } from '../../../../core/form'

export interface FormLine {
  // 处理时是售后明细 id，新建时是订单明细 id
  id: string
  name: string
  unit: string
  maxQty: number
  maxText: string
  qty: number
  priceText: string
  reason: string
  description: string
  // 处理时只读显示门店填的原因和图片
  readonlyMeta: string
  images: { url: string; thumbUrl: string }[]
  urls: string[]
}

export function processLinesOf(after: AfterDetail): FormLine[] {
  return after.lines.map((line) => ({
    id: line.id,
    name: line.name,
    unit: line.unit,
    maxQty: line.maxQty,
    maxText: copy.screen.maxQty(line.maxQty),
    qty: line.qty,
    priceText: textOfCents(line.priceCents),
    reason: line.reason,
    description: line.description,
    readonlyMeta: labels.afterReason[line.reason],
    images: line.images.map(({ url, thumbUrl }) => ({ url, thumbUrl })),
    urls: line.images.map((image) => image.url),
  }))
}

export function createLineOf(line: OrderLine): FormLine {
  const maxQty = line.maxQty ?? 0
  return {
    id: line.id,
    name: line.name,
    unit: line.unit,
    maxQty,
    maxText: copy.screen.maxQty(maxQty),
    qty: 1,
    priceText: textOfCents(line.priceCents),
    reason: '',
    description: '',
    readonlyMeta: '',
    images: [],
    urls: [],
  }
}

function centsOf(line: FormLine): number {
  return lineCents(line.qty, centsOfText(line.priceText))
}

export function amountTextsOf(lines: readonly FormLine[]): string[] {
  return lines.map((line) => formatMoney(centsOf(line)))
}

export function totalRowsOf(lines: readonly FormLine[]) {
  return lines.length > 1
    ? [{ label: copy.screen.label.total, value: formTotalOf(sumCents(lines, centsOf), [...lines]) }]
    : []
}

export interface LineErrors {
  qty: string
  price: string
  reason: string
}

export function lineErrorsOf(fields: Record<string, string>, count: number): LineErrors[] {
  return Array.from({ length: count }, (_, index) => ({
    qty: fields[`lines.${index}.qty`] ?? '',
    price: fields[`lines.${index}.priceCents`] ?? '',
    reason: fields[`lines.${index}.reason`] ?? '',
  }))
}

export function checkProcess(
  lines: readonly FormLine[],
  note: string,
  version: number,
): Checked<AfterProcess> {
  const body = lines.map((line) => ({
    id: line.id,
    qty: line.qty,
    priceCents: centsOfText(line.priceText),
  }))
  return checkedOf(afterProcessSchema.safeParse({ version, note, lines: body }))
}

export function checkCreate(
  lines: readonly FormLine[],
  note: string,
  orderId: string,
): Checked<AfterCreate> {
  const body = lines.map((line) => ({
    orderLineId: line.id,
    qty: line.qty,
    priceCents: centsOfText(line.priceText),
    reason: line.reason,
    description: line.description,
  }))
  return checkedOf(afterCreateSchema.safeParse({ orderId, note, lines: body }))
}
