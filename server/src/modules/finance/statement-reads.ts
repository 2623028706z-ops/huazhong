import { PAGE_SIZE, addDays, type StatementKind } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { customers, suppliers, statements, refunds } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { Clock } from '../../common/clock.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import { decodeCursor, pageOf } from '../../common/domain/cursor.ts'
import { sumOf, exactNumber } from '../../common/domain/units.ts'
import { creditSources, overdueDays } from '../../common/statements.ts'
import { found } from '../../common/scope.ts'
import { sourcesOf } from './sources.ts'
import { refundViews } from './refund-reads.ts'
import { partySummaries } from './party-reads.ts'
import { externalList, externalDetail } from './external-statements.ts'
import { statementViews, statementCards, type StatementRow } from './statement-view.ts'
export type Query = {
  cursor?: string | undefined
  limit?: number | undefined
  from?: string | undefined
  to?: string | undefined
  status?: 'unsettled' | 'settled' | 'voided' | undefined
  q?: string | undefined
  filter?: 'outstanding' | 'overdue' | 'unstatemented' | undefined
  tab?: 'statements' | 'unstatemented' | undefined
}
type PartyRef = { kind: StatementKind; id: number }
export function page<T extends { id: string }>(all: T[], query: Pick<Query, 'cursor' | 'limit'>) {
  const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor)
  const kept = cursor ? all.filter((r) => Number(r.id) < cursor[1]) : all
  return pageOf(kept, query.limit ?? PAGE_SIZE, (r) => [Number(r.id), Number(r.id)])
}
function pageByAmount<T extends { id: string; unstatementedCents: number }>(
  all: T[],
  query: Pick<Query, 'cursor' | 'limit'>,
) {
  const sorted = [...all].sort(
    (a, b) => b.unstatementedCents - a.unstatementedCents || Number(b.id) - Number(a.id),
  )
  const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor)
  const kept = cursor
    ? sorted.filter(
        (r) =>
          r.unstatementedCents < Number(cursor[0]) ||
          (r.unstatementedCents === Number(cursor[0]) && Number(r.id) < cursor[1]),
      )
    : sorted
  return pageOf(kept, query.limit ?? PAGE_SIZE, (r) => [r.unstatementedCents, Number(r.id)])
}
// 往来排序键：段（0 有逾期、1 有未收、2 没欠款）+ 未收金额倒序 + id 倒序，写成一个字符串当游标
const CENTS_CEILING = 1_000_000_000_000_000
const KEY_WIDTH = 16
function debtKeyOf(r: { id: string; overdueCents: number; outstandingCents: number }): string {
  const segment = r.overdueCents > 0 ? 0 : r.outstandingCents > 0 ? 1 : 2
  return [
    segment,
    String(CENTS_CEILING - r.outstandingCents).padStart(KEY_WIDTH, '0'),
    String(CENTS_CEILING - Number(r.id)).padStart(KEY_WIDTH, '0'),
  ].join('|')
}
function pageByDebt<T extends { id: string; overdueCents: number; outstandingCents: number }>(
  all: T[],
  query: Pick<Query, 'cursor' | 'limit'>,
) {
  const keyed = all
    .map((r) => ({ r, key: debtKeyOf(r) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor)
  const kept = cursor ? keyed.filter((row) => row.key > String(cursor[0])) : keyed
  const result = pageOf(kept, query.limit ?? PAGE_SIZE, (row) => [row.key, Number(row.r.id)])
  return { ...result, items: result.items.map((row) => row.r) }
}
async function partyOf(tx: Db | Tx, kind: StatementKind, id: number) {
  return kind === 'customer'
    ? found((await tx.select().from(customers).where(eq(customers.id, id)))[0])
    : found((await tx.select().from(suppliers).where(eq(suppliers.id, id)))[0])
}
function matches(
  row: StatementRow,
  query: Query & { overdue?: string | undefined },
  today: string,
) {
  return (
    (!query.status || row.status === query.status) &&
    (!query.from || row.statementDate >= query.from) &&
    (!query.to || row.statementDate <= query.to) &&
    (query.overdue !== 'true' ||
      (row.status === 'unsettled' && overdueDays(row.dueDate, today) > 0))
  )
}
@Injectable()
export class StatementReads {
  constructor(
    @Inject(DB) readonly db: Db,
    readonly clock: Clock,
  ) {}
  read<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(work, { isolationLevel: 'repeatable read', accessMode: 'read only' })
  }
  async rows(tx: Db | Tx, kind?: StatementKind, id?: number) {
    return tx
      .select()
      .from(statements)
      .where(
        and(
          kind ? eq(statements.kind, kind) : undefined,
          id === undefined
            ? undefined
            : kind === 'customer'
              ? eq(statements.customerId, id)
              : eq(statements.supplierId, id),
        ),
      )
      .orderBy(desc(statements.id))
  }
  async terms(tx: Db | Tx, kind: StatementKind, id: number) {
    const party = await partyOf(tx, kind, id)
    const rows = await this.rows(tx, kind, id)
    return {
      version: party.version,
      termDays: party.termDays,
      openingDebtCents: party.openingDebtCents,
      // 没有未作废的对账单才能改（作废后期初欠款回到待入单，可以再改）
      openingDebtEditable: !rows.some((r) => r.status !== 'voided'),
    }
  }
  async draft(
    tx: Db | Tx,
    kind: StatementKind,
    id: number,
    period: { from?: string | undefined; to?: string | undefined } = {},
  ) {
    const party = await partyOf(tx, kind, id),
      periodTo = period.to ?? this.clock.today()
    const rows = await this.rows(tx, kind, id),
      active = rows.filter((r) => r.status !== 'voided'),
      openingDebtCents = active.length ? 0 : party.openingDebtCents
    const all = await sourcesOf(tx, { kind, partyId: id, from: periodTo, to: periodTo })
    // 默认起点：上一张对账单截止日的次日；第一次对账从最早一笔未对账单据日期开始；都没有就是截止日当天
    const lastTo = active.map((r) => r.periodTo).reduce((a, b) => (b > a ? b : a), ''),
      earliest = all.map((s) => s.sourceDate).reduce((a, b) => (b < a ? b : a), periodTo),
      periodFrom =
        period.from ??
        (lastTo ? (addDays(lastTo, 1) < periodTo ? addDays(lastTo, 1) : periodTo) : earliest)
    const sources = all.map((s) => ({ ...s, previousPeriod: s.sourceDate < periodFrom })),
      creditCents = sumOf(await creditSources(tx, kind, id), (s) => s.balance)
    const grossCents = sumOf(
        sources.filter((s) => s.carriesAmount),
        (s) => s.amountCents,
      ),
      raw = exactNumber(grossCents + openingDebtCents),
      creditDeductedCents = Math.min(creditCents, Math.max(raw, 0))
    return {
      kind,
      partyId: String(id),
      partyName: party.name,
      partyVersion: party.version,
      periodFrom,
      periodTo,
      creditCents,
      openingDebtCents,
      sources,
      totals: {
        grossCents,
        creditDeductedCents,
        dueCents: Math.max(raw - creditDeductedCents, 0),
        creditGeneratedCents: Math.max(-raw, 0),
      },
    }
  }
  async detail(tx: Db | Tx, id: number, viewer: Viewer) {
    const row = found((await tx.select().from(statements).where(eq(statements.id, id)))[0])
    return found((await statementViews(tx, [row], { viewer, today: this.clock.today() }))[0])
  }
  async cards(tx: Db | Tx, rows: StatementRow[], viewer: Viewer) {
    return statementCards(tx, rows, { viewer, today: this.clock.today() })
  }
  async list(
    tx: Db | Tx,
    viewer: Viewer,
    query: Query & {
      kind?: StatementKind | undefined
      partyId?: string | undefined
      overdue?: string | undefined
    },
    scope?: { kind: StatementKind; id?: number },
  ) {
    const rows = (
      await this.rows(
        tx,
        scope?.kind ?? query.kind,
        scope?.id ?? (query.partyId ? Number(query.partyId) : undefined),
      )
    ).filter((r) => matches(r, query, this.clock.today()))
    const selected = page(
      rows.map((r) => ({ ...r, id: String(r.id) })),
      query,
    )
    return {
      ...selected,
      items: await this.cards(
        tx,
        selected.items.map((r) => ({ ...r, id: Number(r.id) })),
        viewer,
      ),
      actions: [],
      counts: {},
    }
  }
  async summary(tx: Db | Tx, kind: StatementKind, id: number) {
    const party = await partyOf(tx, kind, id)
    const summaries = await partySummaries(tx, {
      kind,
      parties: [party],
      today: this.clock.today(),
    })
    return found(summaries.map(({ ready: _ready, ...summary }) => summary)[0])
  }
  async parties(tx: Db | Tx, kind: StatementKind, query: Query) {
    const rows =
      kind === 'customer'
        ? await tx.select().from(customers).orderBy(desc(customers.id))
        : await tx.select().from(suppliers).orderBy(desc(suppliers.id))
    const summaries = await partySummaries(tx, {
      kind,
      parties: rows.filter((r) => !query.q || r.name.includes(query.q)),
      today: this.clock.today(),
    })
    const counts = {
      outstanding: summaries.filter((r) => r.outstandingCents > 0).length,
      overdue: summaries.filter((r) => r.overdueCents > 0).length,
      unstatemented: summaries.filter((r) => r.ready).length,
    }
    const filtered = summaries.filter((r) => {
      if (query.filter === 'outstanding') return r.outstandingCents > 0
      if (query.filter === 'overdue') return r.overdueCents > 0
      return query.filter !== 'unstatemented' || r.ready
    })
    const listed = filtered.map(({ ready: _ready, ...r }) => ({ ...r, id: r.partyId }))
    // 「可开对账单」按未对账金额从大到小，方便先开金额大的（2026-10-05 体验改版第 1 批）；
    // 其他页签：有逾期在前 → 未收（付）金额大到小 → 没欠款（2026-10-06 第 4 批）
    const result =
      query.filter === 'unstatemented' ? pageByAmount(listed, query) : pageByDebt(listed, query)
    return {
      ...result,
      items: result.items.map(({ id: _id, ...summary }) => summary),
      actions: [],
      counts,
    }
  }
  async ledger(tx: Db | Tx, viewer: Viewer, party: PartyRef, query: Query) {
    const { kind, id } = party,
      summary = await this.summary(tx, kind, id),
      terms = await this.terms(tx, kind, id),
      list = await this.list(tx, viewer, query, party)
    const sources = (
      await sourcesOf(tx, {
        kind,
        partyId: id,
        from: query.from ?? '0001-01-01',
        to: query.to ?? '9999-12-31',
      })
    ).filter((s) => !query.from || s.sourceDate >= query.from)
    const refundRows = await tx
      .select()
      .from(refunds)
      .where(kind === 'customer' ? eq(refunds.customerId, id) : eq(refunds.supplierId, id))
    return {
      ...list,
      ...summary,
      ...terms,
      sources,
      refunds: await refundViews(tx, refundRows, viewer),
      actions: [
        enabledAction('createStatement', null),
        enabledAction(kind === 'customer' ? 'registerReceipt' : 'registerPayment', null),
        ...(summary.creditCents > 0 ? [enabledAction('refundCredit', null)] : []),
        enabledAction('editTerms', null),
      ],
    }
  }
  async unsettled(tx: Db | Tx, viewer: Viewer, kind: StatementKind, id: number) {
    const summary = await this.summary(tx, kind, id),
      rows = (await this.rows(tx, kind, id)).filter((r) => r.status === 'unsettled').reverse()
    return {
      partyId: String(id),
      creditCents: summary.creditCents,
      items: await this.cards(tx, rows, viewer),
      actions: [],
    }
  }
  externalList(tx: Db | Tx, viewer: Viewer, query: Query) {
    return externalList(tx, viewer, query, this.clock.today())
  }
  externalDetail(tx: Db | Tx, viewer: Viewer, id: number) {
    return externalDetail(tx, viewer, id, this.clock.today())
  }
}
