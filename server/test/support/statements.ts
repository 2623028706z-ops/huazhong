import { type contract, type OutputOf, type StatementSource } from '@huazhong/shared'
import { dataOf, type SalesApp } from './sales.ts'

export async function statementInput(
  s: SalesApp,
  kind: 'customer' | 'supplier',
  partyId: string,
  refs?: { type: StatementSource['type']; id: string }[],
) {
  const api = await s.as('u6')
  const draft = dataOf<OutputOf<typeof contract.statementDraft>>(
    await api.get(`/finance/statements/draft?kind=${kind}&partyId=${partyId}`),
  )
  const keys = refs ? new Set(refs.map((ref) => `${ref.type}:${ref.id}`)) : null
  const parentNos = new Set(
    draft.sources
      .filter(
        (source) =>
          ['po', 'wh'].includes(source.type) && (!keys || keys.has(`${source.type}:${source.id}`)),
      )
      .map((source) => source.sourceNo),
  )
  return {
    kind,
    partyId,
    partyVersion: draft.partyVersion,
    periodFrom: draft.periodFrom,
    periodTo: draft.periodTo,
    note: '',
    creditCents: draft.creditCents,
    sources: draft.sources
      .filter(
        (source) =>
          !keys ||
          keys.has(`${source.type}:${source.id}`) ||
          (!source.carriesAmount && parentNos.has(source.sourceNo)),
      )
      .map(({ type, id, version, amountCents }) => ({ type, id, version, amountCents })),
  }
}

export async function openStatement(
  s: SalesApp,
  kind: 'customer' | 'supplier',
  partyId: string,
  refs?: { type: StatementSource['type']; id: string }[],
) {
  return dataOf<OutputOf<typeof contract.createStatement>>(
    await (
      await s.as('u6')
    ).post('/finance/statements', await statementInput(s, kind, partyId, refs)),
  )
}
