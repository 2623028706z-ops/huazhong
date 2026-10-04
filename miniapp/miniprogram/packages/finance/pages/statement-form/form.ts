import {
  type StatementDraft,
  type StatementCreate,
  contract,
  financeCopy as f,
  formatMoney,
} from '@huazhong/shared'
import { checkedOf, type Checked } from '../../../../core/form'
export function draftTotalsOf(draft: StatementDraft, selected: readonly string[]) {
  const set = new Set(selected)
  const sourceCents = draft.sources
    .filter((item) => item.carriesAmount && set.has(`${item.type}:${item.id}`))
    .reduce((sum, item) => sum + item.amountCents, 0)
  const grossCents = sourceCents + draft.openingDebtCents,
    creditDeductedCents = Math.min(draft.creditCents, Math.max(0, grossCents))
  return {
    grossCents,
    creditDeductedCents,
    dueCents: Math.max(0, grossCents - creditDeductedCents),
    creditGeneratedCents: Math.max(0, -grossCents),
  }
}
function selectedSourcesOf(draft: StatementDraft, selected: readonly string[]) {
  const ids = new Set(selected)
  return draft.sources.filter((item) =>
    item.carriesAmount
      ? ids.has(`${item.type}:${item.id}`)
      : item.parentId
        ? ids.has(`${item.parentType ?? 'po'}:${item.parentId}`)
        : ids.has(`${item.type}:${item.id}`),
  )
}
export function checkStatement(
  draft: StatementDraft,
  selected: readonly string[],
  note: string,
): Checked<StatementCreate> {
  const sources = selectedSourcesOf(draft, selected)
  if (!sources.some((item) => item.carriesAmount) && !draft.openingDebtCents)
    return { ok: false, fields: { sources: f.noSources } }
  return checkedOf(
    contract.createStatement.body.safeParse({
      kind: draft.kind,
      partyId: draft.partyId,
      partyVersion: draft.partyVersion,
      periodFrom: draft.periodFrom,
      periodTo: draft.periodTo,
      note,
      creditCents: draft.creditCents,
      sources: sources.map((item) => ({
        type: item.type,
        id: item.id,
        version: item.version,
        amountCents: item.amountCents,
      })),
    }),
  )
}
// 金额格：发货（收货）、售后（退货）、期初欠款（为 0 不显示，在抵扣前）、抵扣多收（多付）、应收（应付）。
// 收货金额 = 净额 + 退货金额，和对账单详情同一口径；售后、抵扣写负数
export function draftCellsOf(
  draft: StatementDraft,
  selected: readonly string[],
  supplier: boolean,
) {
  const totals = draftTotalsOf(draft, selected),
    picked = selectedSourcesOf(draft, selected).filter((item) => item.carriesAmount)
  const sumOf = (type: string) =>
    picked.filter((item) => item.type === type).reduce((sum, item) => sum + item.amountCents, 0)
  const gross = picked.reduce((sum, item) => sum + item.amountCents, 0),
    returns = -sumOf('purchase_return'),
    after = -sumOf('after')
  const cell = (
    label: string,
    amountCents: number,
    options: { due?: boolean; minus?: boolean } = {},
  ) => ({
    label,
    amountCents,
    due: options.due ?? false,
    ...(options.minus ? { text: formatMoney(-amountCents) } : {}),
  })
  return [
    supplier ? cell(f.received, gross + returns) : cell(f.shipped, sumOf('order')),
    supplier ? cell(f.returned, returns, { minus: true }) : cell(f.after, after, { minus: true }),
    ...(draft.openingDebtCents ? [cell(f.openingDebt, draft.openingDebtCents)] : []),
    cell(supplier ? f.supplierDeducted : f.deducted, totals.creditDeductedCents, { minus: true }),
    cell(supplier ? f.payable : f.receivable, totals.dueCents, { due: true }),
  ]
}
