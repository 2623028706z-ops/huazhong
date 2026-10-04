import {
  type StatementDraft,
  type StatementCreate,
  contract,
  financeCopy as f,
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
export function selectedSourcesOf(draft: StatementDraft, selected: readonly string[]) {
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
