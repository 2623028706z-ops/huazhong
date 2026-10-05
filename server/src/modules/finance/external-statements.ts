import {
  appError,
  externalStatementCardSchema,
  storeStatementDetailSchema,
  supplierStatementDetailSchema,
  type StatementDetail,
} from '@huazhong/shared'
import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { statements } from '../../../db/schema/index.ts'
import { sumOf } from '../../common/domain/units.ts'
import { found } from '../../common/scope.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { statementViews } from './statement-view.ts'
import { sourcesOf } from './sources.ts'
import { page, type Query } from './statement-reads.ts'
function identity(viewer: Viewer) {
  return viewer.type === 'store'
    ? { kind: 'customer' as const, partyId: found(viewer.customerId ?? undefined) }
    : { kind: 'supplier' as const, partyId: found(viewer.supplierId ?? undefined) }
}
function storeProjection(d: StatementDetail, viewer: Viewer) {
  const own = d.groups.filter((g) => g.storeId === String(viewer.storeId))
  if (!own.length) return null
  const sources = own.flatMap((g) => g.sources),
    amount = sumOf(own, (g) => g.amountCents)
  return {
    ...d,
    amountCents: Math.max(amount, 0),
    dueCents: Math.max(amount, 0),
    storeAmountCents: amount,
    wholeAmountCents: d.amountCents,
    storeCount: new Set(d.groups.flatMap((g) => (g.storeId === null ? [] : [g.storeId]))).size,
    storeName: own[0]?.storeName ?? '',
    sourceCount: sources.filter((s) => s.type === 'order').length,
    shippedCents: sumOf(
      sources.filter((s) => s.type === 'order'),
      (s) => s.amountCents,
    ),
    afterCents: -sumOf(
      sources.filter((s) => s.type === 'after'),
      (s) => s.amountCents,
    ),
    groups: own,
    actions: [],
  }
}
const supplierOnly = { storeAmountCents: null, wholeAmountCents: null, storeCount: null }
function externalCard(d: StatementDetail, viewer: Viewer) {
  const projected = viewer.type === 'store' ? storeProjection(d, viewer) : { ...d, ...supplierOnly }
  return projected === null ? null : externalStatementCardSchema.parse(projected)
}
export async function externalList(tx: Db | Tx, viewer: Viewer, query: Query, today: string) {
  const { kind, partyId } = identity(viewer)
  const rows = await tx
    .select()
    .from(statements)
    .where(
      and(
        eq(statements.kind, kind),
        kind === 'customer'
          ? eq(statements.customerId, partyId)
          : eq(statements.supplierId, partyId),
        ne(statements.status, 'voided'),
      ),
    )
    .orderBy(desc(statements.id))
  const details = await statementViews(tx, rows, { viewer, today })
  const cards = details.map((d) => externalCard(d, viewer)).filter((c) => c !== null)
  const filtered = cards.filter(
    (r) =>
      (!query.status || r.status === query.status) &&
      (!query.from || r.statementDate >= query.from) &&
      (!query.to || r.statementDate <= query.to),
  )
  const sources = await sourcesOf(tx, { kind, partyId, from: '0001-01-01', to: '9999-12-31' })
  return {
    ...page(filtered, query),
    actions: [],
    counts: {},
    unsettledCents: sumOf(
      cards.filter((c) => c.status === 'unsettled'),
      (c) => c.storeAmountCents ?? c.amountCents,
    ),
    unstatementedCents: sumOf(
      sources.filter(
        (s) => s.carriesAmount && (kind === 'supplier' || s.storeId === String(viewer.storeId)),
      ),
      (s) => s.amountCents,
    ),
  }
}
export async function externalDetail(tx: Db | Tx, viewer: Viewer, id: number, today: string) {
  const row = found((await tx.select().from(statements).where(eq(statements.id, id)))[0]),
    { kind, partyId } = identity(viewer)
  if (
    row.status === 'voided' ||
    row.kind !== kind ||
    (row.customerId ?? row.supplierId) !== partyId
  )
    throw appError.notFound()
  const detail = found((await statementViews(tx, [row], { viewer, today }))[0])
  if (viewer.type === 'store')
    return storeStatementDetailSchema.parse(found(storeProjection(detail, viewer) ?? undefined))
  return supplierStatementDetailSchema.parse({
    ...detail,
    ...supplierOnly,
    settlements: detail.settlements.filter((s) => s.status === 'valid' && s.reversedAt === null),
    actions: [],
  })
}
