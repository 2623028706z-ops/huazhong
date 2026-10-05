import { type StatementKind, type PartyLedger } from '@huazhong/shared'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { statements, receipts, payments, customers, suppliers } from '../../../db/schema/index.ts'
import { sumOf, exactNumber } from '../../common/domain/units.ts'
import { creditSourcesByParty, overdueDays, type CreditSource } from '../../common/statements.ts'
import { sourcesByParty } from './sources.ts'
import type { StatementSource } from '@huazhong/shared'
import type { StatementRow } from './statement-view.ts'
type Party = Pick<typeof customers.$inferSelect, 'id' | 'name' | 'enabled' | 'openingDebtCents'>
type Dates = { partyId: number; day: string }[]
type Context = {
  kind: StatementKind
  today: string
  rows: StatementRow[]
  sources: Map<number, StatementSource[]>
  credit: Map<number, CreditSource[]>
  dates: Dates
}
// 「可开对账单」：有已发货订单、已收货采购单或手工入库还没进有效对账单；
// 只剩售后、退货、改价凭据的不算（03 章第 8.4 节，2026-10-05 体验改版第 1 批）
const readyTypes: ReadonlySet<StatementSource['type']> = new Set(['order', 'po', 'wh'])
function isReady(sources: StatementSource[] | undefined) {
  return (sources ?? []).some((s) => readyTypes.has(s.type))
}
// 财务首页待办：可开对账单的往来单位家数
export async function readyPartyCount(tx: Db | Tx, kind: StatementKind) {
  const ids = (
    kind === 'customer'
      ? await tx.select({ id: customers.id }).from(customers)
      : await tx.select({ id: suppliers.id }).from(suppliers)
  ).map((r) => r.id)
  const sources = await sourcesByParty(tx, kind, ids, { from: '0001-01-01', to: '9999-12-31' })
  return ids.filter((id) => isReady(sources.get(id))).length
}
function lastFundDate(dates: Dates, id: number) {
  return (
    dates
      .filter((f) => f.partyId === id)
      .map((f) => f.day)
      .sort()
      .at(-1) ?? null
  )
}
async function fundDates(tx: Db | Tx, kind: StatementKind, ids: number[]): Promise<Dates> {
  return kind === 'customer'
    ? tx
        .select({ partyId: receipts.customerId, day: receipts.receiptDate })
        .from(receipts)
        .where(and(inArray(receipts.customerId, ids), eq(receipts.status, 'valid')))
    : tx
        .select({ partyId: payments.supplierId, day: payments.payDate })
        .from(payments)
        .where(and(inArray(payments.supplierId, ids), eq(payments.status, 'valid')))
}
type Summary = Pick<
  PartyLedger,
  | 'kind'
  | 'partyId'
  | 'partyName'
  | 'enabled'
  | 'outstandingCents'
  | 'unsettledCents'
  | 'unsettledCount'
  | 'unstatementedCents'
  | 'creditCents'
  | 'lastStatementTo'
  | 'lastFundDate'
  | 'overdueCents'
  | 'overdueDays'
  | 'overdue'
>
function summaryOf(p: Party, c: Context): Summary & { ready: boolean } {
  const own = c.rows.filter((r) => (r.customerId ?? r.supplierId) === p.id),
    unsettled = own.filter((r) => r.status === 'unsettled'),
    overdue = unsettled.filter((r) => overdueDays(r.dueDate, c.today) > 0)
  const unsettledCents = sumOf(unsettled, (r) => r.dueCents),
    unstatementedCents = sumOf(
      (c.sources.get(p.id) ?? []).filter((s) => s.carriesAmount),
      (s) => s.amountCents,
    ),
    creditCents = sumOf(c.credit.get(p.id) ?? [], (s) => s.balance)
  return {
    kind: c.kind,
    partyId: String(p.id),
    partyName: p.name,
    enabled: p.enabled,
    outstandingCents: Math.max(
      exactNumber(
        unsettledCents +
          unstatementedCents +
          (own.some((r) => r.status !== 'voided') ? 0 : p.openingDebtCents) -
          creditCents,
      ),
      0,
    ),
    unsettledCents,
    unsettledCount: unsettled.length,
    unstatementedCents,
    creditCents,
    lastStatementTo: own.find((r) => r.status !== 'voided')?.periodTo ?? null,
    lastFundDate: lastFundDate(c.dates, p.id),
    overdueCents: sumOf(overdue, (r) => r.dueCents),
    overdueDays: Math.max(0, ...overdue.map((r) => overdueDays(r.dueDate, c.today))),
    overdue: overdue.length > 0,
    ready: isReady(c.sources.get(p.id)),
  }
}
export async function partySummaries(
  tx: Db | Tx,
  input: { kind: StatementKind; parties: Party[]; today: string },
) {
  const { kind, parties, today } = input,
    ids = parties.map((p) => p.id)
  if (!ids.length) return []
  const rows = await tx
    .select()
    .from(statements)
    .where(
      kind === 'customer'
        ? inArray(statements.customerId, ids)
        : inArray(statements.supplierId, ids),
    )
    .orderBy(desc(statements.id))
  const sources = await sourcesByParty(tx, kind, ids, { from: '0001-01-01', to: '9999-12-31' })
  const credit = await creditSourcesByParty(tx, kind, ids)
  const dates = await fundDates(tx, kind, ids)
  return parties.map((p) => summaryOf(p, { kind, today, rows, sources, credit, dates }))
}
