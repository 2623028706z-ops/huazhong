import { contract, copy, type InviteDetail, type PoDetail } from '@huazhong/shared'
import { checkedOf, unplacedErrorOf } from '../core/form'
import { centsOfText, lineCents, sumCents, textOfCents } from '../core/money'

export type PurchaseMode = 'po' | 'invite' | 'supply'
export function purchaseSuccessOf(mode: PurchaseMode, editing: boolean, supplierName: string) {
  if (mode !== 'invite') return copy.action.saved
  return editing ? copy.screen.inviteEdited : copy.screen.inviteSent(supplierName)
}
export function purchaseErrorOf(fields: Record<string, string>) {
  return unplacedErrorOf(fields, [
    'supplierId',
    'reason',
    'lines.*.qty',
    'lines.*.needQty',
    'lines.*.priceCents',
  ])
}
export function purchaseTitles(mode: PurchaseMode, editing: boolean) {
  if (mode === 'supply')
    return { title: copy.screen.title.supply, submitText: copy.screen.action.submitSupply }
  if (mode === 'invite')
    return {
      title: editing ? copy.screen.title.editInvite : copy.screen.title.createInvite,
      submitText: editing ? copy.screen.action.saveEdit : copy.screen.title.createInvite,
    }
  return {
    title: editing ? copy.screen.title.editPo : copy.screen.title.createPo,
    submitText: editing ? copy.screen.action.saveEdit : copy.screen.action.confirmPo,
  }
}
export interface MaterialOption {
  id: string
  name: string
  unit: string
  stockQty?: number
}
export interface PurchaseLine extends MaterialOption {
  qty: number
  priceText: string
  needQty: number | null
  enabled: boolean
}
export interface PurchaseForm {
  supplierId: string
  note: string
  reason: string
  lines: PurchaseLine[]
}
export interface PurchaseDraft {
  supplierId: string
  lines: PurchaseLine[]
}
export function blankPurchaseForm(): PurchaseForm {
  return { supplierId: '', note: '', reason: '', lines: [] }
}
export function purchaseLineOf(m: MaterialOption, qty = 1): PurchaseLine {
  return { ...m, qty, priceText: '', needQty: null, enabled: true }
}
export function poFormOf(po: PoDetail, reason = ''): PurchaseForm {
  return {
    supplierId: po.supplierId,
    note: po.note ?? '',
    reason,
    lines: po.lines.map((l) => ({
      ...purchaseLineOf({ id: l.materialId, name: l.name, unit: l.unit }, l.qty),
      priceText: textOfCents(l.priceCents),
    })),
  }
}
export function inviteFormOf(invite: InviteDetail): PurchaseForm {
  return {
    supplierId: invite.supplierId,
    note: '',
    reason: '',
    lines: invite.lines.map((l) => ({
      ...purchaseLineOf({ id: l.materialId, name: l.name, unit: l.unit }, l.needQty),
      needQty: l.needQty,
      enabled: l.enabled,
    })),
  }
}
export function purchaseLineViews(
  lines: PurchaseLine[],
  mode: PurchaseMode,
  fields: Record<string, string> = {},
) {
  return lines.map((line, index) => ({
    ...line,
    key: line.id,
    priceCents: centsOfText(line.priceText) ?? 0,
    amountCents: lineCents(line.qty, centsOfText(line.priceText)),
    qtyError: fields[`lines.${index}.${mode === 'invite' ? 'needQty' : 'qty'}`] ?? '',
    priceError: fields[`lines.${index}.priceCents`] ?? '',
    meta:
      mode === 'invite'
        ? copy.screen.stockQty(line.stockQty ?? 0, line.unit)
        : line.needQty === null
          ? ''
          : copy.screen.needQty(line.needQty, line.unit),
    tags: line.enabled ? [] : [{ text: copy.screen.tag.discontinued, warn: true }],
    readonly: mode === 'supply' && !line.enabled,
  }))
}
export function purchaseAmount(lines: PurchaseLine[]): number {
  return sumCents(lines, (line) => lineCents(line.qty, centsOfText(line.priceText)))
}
export function checkPurchaseForm(form: PurchaseForm, mode: PurchaseMode, version: number | null) {
  const lines = form.lines.map((l) => ({
    materialId: l.id,
    qty: l.qty,
    priceCents: centsOfText(l.priceText),
    needQty: l.qty,
  }))
  if (mode === 'po') {
    const input = {
      supplierId: form.supplierId,
      note: form.note,
      reason: form.reason,
      lines,
      version,
    }
    return checkedOf(
      version === null
        ? contract.createPurchaseOrder.body.safeParse(input)
        : contract.updatePurchaseOrder.body.safeParse(input),
    )
  }
  if (mode === 'supply')
    return checkedOf(contract.submitSupplierInvite.body.safeParse({ version, lines }))
  const input = { supplierId: form.supplierId, version, lines }
  return checkedOf<unknown>(
    version === null
      ? contract.createInvite.body.safeParse(input)
      : contract.updateInvite.body.safeParse(input),
  )
}
