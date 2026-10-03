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
  type OutputOf,
  contract,
} from '@huazhong/shared'
import { centsOfText, sumCents, textOfCents } from '../../../../core/money'
import { checkedOf, type Checked } from '../../../../core/form'

export interface AllocLine {
  orderId: string
  orderNo: string
  unpaidCents: number
  text: string
  version: number
  notice?: string | null
  docType?: 'po' | 'wh'
  docId?: string
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
    version: card.version,
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
  const line = lines[index]
  const unpaid = line?.unpaidCents ?? 0
  const amount = Math.max(0, Math.min(unpaid, availableCents - others))
  // 手工入库单只整单付款：钱不够付满就不填
  if (line?.docType === 'wh' && amount < unpaid) return ''
  return textOfCents(amount)
}

export function allocRowsOf(lines: readonly AllocLine[]) {
  return lines.map((line) => ({
    orderId: line.orderId,
    name: line.orderNo,
    sub: formatMoney(line.unpaidCents),
    text: line.text,
    notice: line.notice ?? '',
  }))
}

// 汇总：登记收款「本次核销 ¥… / 转为预收 ¥…」；核销预收「可用预收 ¥…」
export function summaryOf(
  form: ReceiveForm,
  isAllocate: boolean,
  prepaidCents: number,
  isPayment = false,
): string {
  const allocated = sumCents(form.allocs, allocCents)
  if (isAllocate)
    return (isPayment ? copy.rework.paymentAvailablePrepaid : copy.screen.availablePrepaid)(
      formatMoney(prepaidCents - allocated),
    )
  const amount = centsOfText(form.amountText) ?? 0
  return (isPayment ? copy.rework.paymentAllocSummary : copy.screen.allocSummary)(
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
  ledgerToken = '',
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
      ledgerToken,
      expected: expectedOf(form.allocs),
    }),
  )
}

function expectedOf(lines: readonly AllocLine[]) {
  return lines.map((line) => ({
    orderId: line.orderId,
    version: line.version,
    unpaidCents: line.unpaidCents,
  }))
}

export function autoFillAll(lines: readonly AllocLine[], availableCents: number): AllocLine[] {
  let remaining = availableCents
  return lines.map((line) => {
    const fit = Math.max(0, Math.min(line.unpaidCents, remaining))
    const amount = line.docType === 'wh' && fit < line.unpaidCents ? 0 : fit
    remaining -= amount
    return { ...line, text: amount ? textOfCents(amount) : '' }
  })
}

export function checkAllocate(
  form: ReceiveForm,
  customerId: string,
  ledgerToken = '',
): Checked<PrepaidAllocate> {
  return checkedOf(
    prepaidAllocateSchema.safeParse({
      customerId,
      allocs: bodyAllocsOf(form.allocs),
      ledgerToken,
      expected: expectedOf(form.allocs),
    }),
  )
}

export function paymentLinesOf(
  cards: OutputOf<typeof contract.listUnpaidDocuments>['items'],
): AllocLine[] {
  return cards.map((card) => ({
    orderId: `${card.docType}:${card.docId}`,
    docType: card.docType,
    docId: card.docId,
    orderNo:
      card.docType === 'wh'
        ? [copy.stock.screen.paymentStockIn, card.no].join(copy.separator)
        : card.no,
    version: card.version,
    unpaidCents: card.unpaidCents,
    text: '',
    notice: card.notice,
  }))
}

export function checkPayment(
  form: ReceiveForm,
  supplierId: string,
  ledgerToken: string,
  isAllocate: boolean,
) {
  const snapshot = {
    supplierId,
    ledgerToken,
    expected: form.allocs.map((line) => ({
      docType: line.docType,
      docId: line.docId,
      version: line.version,
      unpaidCents: line.unpaidCents,
    })),
    allocs: form.allocs
      .filter((line) => line.text.trim() !== '')
      .map((line) => ({
        docType: line.docType,
        docId: line.docId,
        amountCents: centsOfText(line.text),
      })),
  }
  return checkedOf<unknown>(
    isAllocate
      ? contract.allocatePaymentPrepaid.body.safeParse(snapshot)
      : contract.createPayment.body.safeParse({
          ...snapshot,
          payDate: form.receiptDate,
          amountCents: centsOfText(form.amountText),
          methodName: form.methodName,
          note: form.note,
        }),
  )
}
