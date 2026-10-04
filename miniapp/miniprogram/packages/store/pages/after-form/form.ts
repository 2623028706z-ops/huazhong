// 申请售后的表单行（06 章 S8）：数量上限 maxQty，问题原因、问题说明、图片；即时校验用和后端同一份 Zod 规则
import {
  copy,
  fieldsOf,
  storeAfterCreateSchema,
  type OrderLine,
  type StoreAfterCreate,
} from '@huazhong/shared'
import type { UploadedImage } from '../../../../core/upload'

export interface FormLine {
  orderLineId: string
  name: string
  unit: string
  code: string | null
  maxQty: number
  maxText: string
  qty: number
  reason: string
  description: string
  images: UploadedImage[]
}

export function formLineOf(line: OrderLine): FormLine {
  const maxQty = line.maxQty ?? 0
  return {
    orderLineId: line.id,
    name: line.name,
    unit: line.unit,
    code: line.customerCode,
    maxQty,
    maxText: copy.screen.maxQty(maxQty),
    qty: 1,
    reason: '',
    description: '',
    images: [],
  }
}

export interface LineErrors {
  qty: string
  reason: string
  description: string
  images: string
}

// fields 的键是 lines.0.qty 这种路径（05 章第 1.4 节），换成每一行一组
export function lineErrorsOf(fields: Record<string, string>, count: number): LineErrors[] {
  return Array.from({ length: count }, (_, index) => ({
    qty: fields[`lines.${index}.qty`] ?? '',
    reason: fields[`lines.${index}.reason`] ?? '',
    description: fields[`lines.${index}.description`] ?? '',
    images: fields[`lines.${index}.imageFileIds`] ?? '',
  }))
}

type Checked = { ok: true; body: StoreAfterCreate } | { ok: false; fields: Record<string, string> }

export function checkForm(orderId: string, lines: readonly FormLine[]): Checked {
  const quantityErrors: Record<string, string> = {}
  lines.forEach((line, index) => {
    if (line.qty > line.maxQty) quantityErrors[`lines.${index}.qty`] = line.maxText
  })
  if (Object.keys(quantityErrors).length) return { ok: false, fields: quantityErrors }
  const parsed = storeAfterCreateSchema.safeParse({
    orderId,
    lines: lines.map((line) => ({
      orderLineId: line.orderLineId,
      qty: line.qty,
      reason: line.reason,
      description: line.description,
      imageFileIds: line.images.map((image) => image.fileId),
    })),
  })
  return parsed.success
    ? { ok: true, body: parsed.data }
    : { ok: false, fields: fieldsOf(parsed.error) }
}
