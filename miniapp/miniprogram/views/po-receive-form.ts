import { copy, formatMoney, type PoDetail } from '@huazhong/shared'
import { centsOfText, lineCents, textOfCents } from '../core/money'

export interface ReceiveLine {
  key: string
  materialId: string
  name: string
  code?: string
  unit: string
  qty: number
  priceText: string
  orderQty: number
  orderPriceCents: number
  max?: number
}
export function receiveLinesOf(
  po: PoDetail,
  mode: 'receive' | 'return' | 'reprice',
): ReceiveLine[] {
  return po.lines.map((line) => ({
    key: line.id,
    materialId: line.materialId,
    name: line.name,
    code: line.code,
    unit: line.unit,
    qty: mode === 'return' ? 0 : (line.receivedQty ?? line.qty) - line.returnedQty,
    priceText: textOfCents(line.priceCents),
    orderQty: line.qty,
    orderPriceCents: line.orderPriceCents,
    ...(mode === 'return' ? { max: line.maxReturnQty ?? 0 } : {}),
  }))
}
export function receiveViewsOf(
  lines: ReceiveLine[],
  receiving: boolean,
  fields: Record<string, string> = {},
) {
  return lines.map((line, index) => ({
    ...line,
    priceCents: centsOfText(line.priceText) ?? 0,
    amountCents: lineCents(line.qty, centsOfText(line.priceText)),
    tags: receiving ? receiveTagsOf(line) : [],
    meta:
      line.max === undefined
        ? copy.screen.purchaseQty(line.orderQty, line.unit)
        : copy.screen.returnableQty(line.max, line.unit),
    qtyError: fields[`lines.${index}.${receiving ? 'receivedQty' : 'qty'}`] ?? '',
    priceError: fields[`lines.${index}.priceCents`] ?? '',
  }))
}
function receiveTagsOf(line: ReceiveLine) {
  const price = centsOfText(line.priceText)
  return [
    ...(line.qty < line.orderQty
      ? [{ text: copy.screen.shortReceived(line.orderQty - line.qty), warn: true }]
      : []),
    ...(line.qty > line.orderQty
      ? [{ text: copy.screen.overReceived(line.qty - line.orderQty), warn: true }]
      : []),
    ...(price !== null && price !== line.orderPriceCents
      ? [
          {
            text: copy.screen.repriceFrom(formatMoney(line.orderPriceCents), formatMoney(price)),
            warn: true,
          },
        ]
      : []),
  ]
}
export function receiveInputOf(lines: ReceiveLine[]) {
  return lines.map((line) => ({
    poLineId: line.key,
    receivedQty: line.qty,
    priceCents: centsOfText(line.priceText),
  }))
}
