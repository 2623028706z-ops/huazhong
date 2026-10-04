import {
  copy,
  financeCopy as f,
  formatMoney,
  receiptCreateSchema,
  paymentCreateSchema,
  type ReceiptCreate,
  type PaymentCreate,
  type StatementCard,
} from '@huazhong/shared'
import { centsOfText } from '../../../../core/money'
import { checkedOf, type Checked } from '../../../../core/form'
export interface ReceiveForm {
  receiptDate: string
  amountText: string
  discountText: string
  discountReason: string
  methodName: string
  note: string
  statements: StatementCard[]
}
export function selectedTotalOf(form: ReceiveForm): number {
  return form.statements.reduce((sum, item) => sum + item.dueCents, 0)
}
export function settlementSummaryOf(form: ReceiveForm, payment = false): string {
  const selected = selectedTotalOf(form),
    amount = centsOfText(form.amountText) ?? 0,
    discount = centsOfText(form.discountText) || 0
  return [
    `${f.unsettled} ${formatMoney(selected)}`,
    `${f.discount} ${formatMoney(discount)}`,
    `${payment ? f.supplierCredited : f.credited} ${formatMoney(Math.max(0, amount - selected))}`,
  ].join(copy.separator)
}
function fieldsOf(form: ReceiveForm, today: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const amount = centsOfText(form.amountText),
    discount = form.discountText.trim() ? centsOfText(form.discountText) : 0,
    total = selectedTotalOf(form)
  if (form.receiptDate > today) fields.receiptDate = copy.finance.receiptDateFuture
  if (form.discountText.trim() && discount === null) fields.discountCents = f.amountRequired
  if (form.statements.length && amount !== null && discount !== null && amount + discount < total)
    fields.amountCents = f.insufficient(formatMoney(total - amount - discount))
  return fields
}
function fundBody(form: ReceiveForm) {
  return {
    amountCents: centsOfText(form.amountText),
    discountCents: form.discountText.trim() ? centsOfText(form.discountText) : 0,
    discountReason: form.discountReason,
    methodName: form.methodName,
    note: form.note,
    statements: form.statements.map(({ id, version }) => ({ id, version })),
  }
}
export function checkReceipt(
  form: ReceiveForm,
  customerId: string,
  today: string,
): Checked<ReceiptCreate> {
  const fields = fieldsOf(form, today)
  return Object.keys(fields).length
    ? { ok: false, fields }
    : checkedOf(
        receiptCreateSchema.safeParse({
          customerId,
          receiptDate: form.receiptDate,
          ...fundBody(form),
        }),
      )
}
export function checkPayment(
  form: ReceiveForm,
  supplierId: string,
  today: string,
): Checked<PaymentCreate> {
  const fields = fieldsOf(form, today)
  return Object.keys(fields).length
    ? { ok: false, fields }
    : checkedOf(
        paymentCreateSchema.safeParse({ supplierId, payDate: form.receiptDate, ...fundBody(form) }),
      )
}
