// 登记收款 / 核销预收的表单（06 章 F4）：核销明细每行本次核销；「填入」取未收和「可用金额 − 已填核销」中较小的。
// 即时校验用和后端同一份 Zod 规则
import {
  copy,
  formatMoney,
  prepaidAllocateSchema,
  receiptCreateSchema,
  type ArCard,
  type PrepaidAllocate,
  type ReceiptCreate,
} from '@huazhong/shared'
import { centsOfText, sumCents, textOfCents } from '../../../../core/money'
import { checkedOf, type Checked } from '../../../../core/form'

export interface AllocLine {
  orderId: string
  orderNo: string
  unpaidCents: number
  text: string
}

export interface ReceiveForm {
  receiptDate: string
  amountText: string
  methodName: string
  note: string
  allocs: AllocLine[]
}

export function allocLinesOf(cards: readonly ArCard[]): AllocLine[] {
  return cards.map((card) => ({
    orderId: card.orderId,
    orderNo: card.orderNo,
    unpaidCents: card.unpaidCents,
    text: '',
  }))
}

function allocCents(line: AllocLine): number {
  return centsOfText(line.text) ?? 0
}

// 「填入」：可用金额（收款金额或可用预收）减去别的行已填的，不超过这张单的未收
export function fillText(
  lines: readonly AllocLine[],
  index: number,
  availableCents: number,
): string {
  const others = sumCents(
    lines.filter((_, i) => i !== index),
    allocCents,
  )
  const unpaid = lines[index]?.unpaidCents ?? 0
  return textOfCents(Math.max(0, Math.min(unpaid, availableCents - others)))
}

export function allocRowsOf(lines: readonly AllocLine[]) {
  return lines.map((line) => ({
    orderId: line.orderId,
    name: line.orderNo,
    sub: formatMoney(line.unpaidCents),
    text: line.text,
  }))
}

// 汇总：登记收款「本次核销 ¥… / 转为预收 ¥…」；核销预收「可用预收 ¥…」
export function summaryOf(form: ReceiveForm, isAllocate: boolean, prepaidCents: number): string {
  const allocated = sumCents(form.allocs, allocCents)
  if (isAllocate) return copy.screen.availablePrepaid(formatMoney(prepaidCents - allocated))
  const amount = centsOfText(form.amountText) ?? 0
  return copy.screen.allocSummary(
    formatMoney(allocated),
    formatMoney(Math.max(0, amount - allocated)),
  )
}

function bodyAllocsOf(lines: readonly AllocLine[]) {
  return lines
    .filter((line) => line.text.trim() !== '')
    .map((line) => ({ orderId: line.orderId, amountCents: centsOfText(line.text) }))
}

export function checkReceipt(
  form: ReceiveForm,
  customerId: string,
  today: string,
): Checked<ReceiptCreate> {
  if (form.receiptDate > today)
    return { ok: false, fields: { receiptDate: copy.finance.receiptDateFuture } }
  return checkedOf(
    receiptCreateSchema.safeParse({
      customerId,
      receiptDate: form.receiptDate,
      amountCents: centsOfText(form.amountText),
      methodName: form.methodName,
      note: form.note,
      allocs: bodyAllocsOf(form.allocs),
    }),
  )
}

export function checkAllocate(form: ReceiveForm, customerId: string): Checked<PrepaidAllocate> {
  return checkedOf(
    prepaidAllocateSchema.safeParse({ customerId, allocs: bodyAllocsOf(form.allocs) }),
  )
}
