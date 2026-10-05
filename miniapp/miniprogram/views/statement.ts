import type { contract } from '@huazhong/shared'
import { cardAmountOf, cardDateOf, subOf, type CardRow } from './card'
import {
  financeCopy as f,
  formatMoney,
  formatTime,
  shanghaiDayOf,
  copy,
  type StatementCard,
  type StatementSource,
  type StatementDetail,
  type PartyLedger,
  type OutputOf,
} from '@huazhong/shared'
// 财务列表的卡：往来、对账单、收付款记录用新卡（CardRow 的 main / sub）；未对账单据仍是字段式（title / fields）
export interface FinanceRow extends Partial<Omit<CardRow, 'id' | 'tags'>> {
  id: string
  title?: string
  status?: string
  headText?: string
  fields?: { label: string; value: string; amount?: boolean; wide?: boolean }[]
  tags?: { text: string; warn: boolean; danger?: boolean }[]
  kind?: 'receipt' | 'payment'
  source?: StatementSource
}
type ExternalCard = OutputOf<typeof contract.storeStatements>['items'][number]
type SourceType = StatementSource['type']
const mainTypes: SourceType[] = ['order', 'po', 'wh']
function isMainSource(source: StatementSource) {
  return mainTypes.includes(source.type)
}
function statementAmountOf(
  card: StatementCard | ExternalCard,
  external: 'store' | 'supplier' | null,
) {
  if (external === 'store' && 'storeAmountCents' in card) return card.storeAmountCents ?? 0
  return card.amountCents
}
export function periodTextOf(from: string, to: string) {
  return f.statementPeriodRange(from, to)
}
// 对账单卡（06 章 F14 列表、S9、P7）：大字对账期间，右边状态 + 金额；逾期标出来
export function statementRowOf(
  card: StatementCard | ExternalCard,
  external: 'store' | 'supplier' | null = null,
): FinanceRow {
  return {
    id: card.id,
    main: periodTextOf(card.periodFrom, card.periodTo),
    serif: true,
    sub: card.no,
    status: card.status,
    amount: cardAmountOf(statementAmountOf(card, external)),
    tags: card.overdueDays
      ? [{ text: f.overdue(card.overdueDays), warn: false, danger: true }]
      : [],
  }
}
const sourceTitles: Record<SourceType, string> = {
  order: f.shipTitle,
  after: f.afterTitle,
  po: f.purchaseTitle,
  wh: f.stockInTitle,
  purchase_return: f.returnTitle,
  price_change: f.priceChangeTitle,
}
const sourceDateLabels: Record<SourceType, string> = {
  order: f.shipDate,
  after: f.afterDate,
  po: f.receiveDate,
  wh: f.stockInDate,
  purchase_return: f.afterDate,
  price_change: f.afterDate,
}
const sourceAmountLabels: Record<SourceType, string> = {
  order: f.shipped,
  after: f.after,
  po: f.received,
  wh: f.received,
  purchase_return: f.returned,
  price_change: f.priceChangeTitle,
}
// 未对账列表里一张单据一张卡：标题写单据种类，字段写全
export function sourceRowOf(source: StatementSource, supplier = false): FinanceRow {
  const payable = supplier && source.amountCents >= 0
  return {
    id: `${source.type}:${source.id}`,
    title: sourceTitles[source.type],
    status: '',
    source,
    fields: [
      { label: f.no, value: source.sourceNo },
      { label: sourceDateLabels[source.type], value: source.sourceDate },
      {
        label: payable ? f.payable : sourceAmountLabels[source.type],
        value: formatMoney(source.amountCents),
        amount: true,
      },
    ],
    tags: source.previousPeriod ? [{ text: f.previousPeriod, warn: false }] : [],
  }
}
export interface ListRow {
  key: string
  title: string
  amountLabel: string
  amount: string
  notes: string[]
  tags?: { text: string; warn: boolean }[]
  selectable?: boolean
  selected?: boolean
  muted?: boolean
}
interface ListGroup {
  key: string
  head: string
  meta: string
  rows: ListRow[]
}
export interface ListSection {
  title: string
  meta: string
  groups: ListGroup[]
  emptyText: string
}
function listRowOf(source: StatementSource, selected: ReadonlySet<string> | null): ListRow {
  const key = `${source.type}:${source.id}`
  return {
    key,
    title: `${f.no} ${source.sourceNo}`,
    amountLabel: sourceAmountLabels[source.type],
    amount: formatMoney(source.amountCents),
    notes: [`${sourceDateLabels[source.type]} ${source.sourceDate}`],
    tags: source.previousPeriod ? [{ text: f.previousPeriod, warn: false }] : [],
    ...(selected && source.previousPeriod && source.carriesAmount
      ? { selectable: true, selected: selected.has(key) }
      : {}),
  }
}
function listSectionOf(
  title: string,
  sources: StatementSource[],
  options: {
    supplier: boolean
    heads: boolean
    count: boolean
    emptyText: string
    selected: ReadonlySet<string> | null
  },
): ListSection {
  const groups = new Map<string, { head: string; sources: StatementSource[] }>()
  for (const source of sources) {
    const key = source.storeId ?? ''
    const group = groups.get(key) ?? {
      head: options.supplier || !options.heads ? '' : (source.storeName ?? ''),
      sources: [],
    }
    group.sources.push(source)
    groups.set(key, group)
  }
  return {
    title,
    meta:
      options.count && sources.length
        ? f.countText(sources.filter((s) => s.carriesAmount).length)
        : '',
    emptyText: options.emptyText,
    groups: [...groups.entries()].map(([key, group]) => ({
      key,
      head: group.head,
      meta: group.head
        ? f.groupMeta(
            group.sources.length,
            formatMoney(
              group.sources.reduce((sum, s) => sum + (s.carriesAmount ? s.amountCents : 0), 0),
            ),
          )
        : '',
      rows: group.sources.map((source) => listRowOf(source, options.selected)),
    })),
  }
}
// 对账单里的两节：发货单（采购单）和售后（退货），分组头写「门店 n 张 小计 ¥…」
export function statementSectionsOf(
  sources: StatementSource[],
  options: {
    supplier: boolean
    heads?: boolean
    // 对账单详情的发货单标题后不写张数（新建对账单写）
    count?: boolean
    emptyAfter?: string
    selected?: ReadonlySet<string> | null
  },
) {
  const { supplier } = options,
    selected = options.selected ?? null,
    heads = options.heads ?? true,
    count = options.count ?? true
  return {
    main: listSectionOf(supplier ? f.purchaseTitle : f.shipTitle, sources.filter(isMainSource), {
      supplier,
      heads,
      count,
      emptyText: f.noUnstatemented,
      selected,
    }),
    after: listSectionOf(
      supplier ? f.returnTitle : f.afterTitle,
      sources.filter((s) => !isMainSource(s)),
      {
        supplier,
        heads,
        count,
        emptyText: options.emptyAfter ?? (supplier ? f.noReturn : f.noAfter),
        selected,
      },
    ),
  }
}
export function sourceRoute(
  source: StatementSource,
  scope: 'finance' | 'internal' = 'finance',
): string {
  const type = source.parentType ?? source.type,
    id = source.parentId ?? source.id
  const page = {
    order: 'sales/pages/order-detail',
    after: 'sales/pages/after-detail',
    po: 'purchase/pages/order-detail',
    wh: 'warehouse/pages/doc-detail',
    purchase_return: 'purchase/pages/order-detail',
    price_change: 'purchase/pages/order-detail',
  }[type]
  return `/packages/${page}/index?scope=${scope}&sourceType=${source.parentType ?? source.type}&id=${id}`
}
type Party = Pick<
  PartyLedger,
  | 'partyId'
  | 'partyName'
  | 'enabled'
  | 'kind'
  | 'outstandingCents'
  | 'unsettledCount'
  | 'unstatementedCents'
  | 'creditCents'
  | 'lastStatementTo'
  | 'lastFundDate'
  | 'overdue'
>
// 往来卡右边金额下面那句：未收（未付）或多收（多付），都没有不写
function partyNoteOf(party: Party, owing: boolean): string {
  const supplier = party.kind === 'supplier'
  if (owing) return supplier ? f.payableOutstanding : f.outstanding
  if (!party.creditCents) return ''
  return supplier ? f.supplierCredited : f.credited
}
// 往来卡（06 章 F1、F8，2026-10-06 第 4 批）：大字往来方；小字未结清 n 张 · 对账截止 · 最近收款 · 未对账 ¥x
// （有才写），一样都没有写「还没有往来」；右边只放一个数：有未收放未收，否则有多收放多收
export function partyRowOf(party: Party): FinanceRow {
  const supplier = party.kind === 'supplier'
  const { labelled } = copy.flow.finance
  const sub = subOf([
    party.unsettledCount ? f.unsettledCount(party.unsettledCount) : '',
    party.lastStatementTo ? labelled(f.lastStatementTo, cardDateOf(party.lastStatementTo)) : '',
    party.lastFundDate
      ? labelled(supplier ? f.lastPaymentDate : f.lastReceiptDate, cardDateOf(party.lastFundDate))
      : '',
    party.unstatementedCents > 0
      ? labelled(f.unstatemented, formatMoney(party.unstatementedCents))
      : '',
  ])
  const owing = party.outstandingCents > 0
  return {
    id: party.partyId,
    main: party.partyName,
    sub: sub || copy.flow.finance.noActivity,
    amount: cardAmountOf(owing ? party.outstandingCents : party.creditCents),
    note: partyNoteOf(party, owing),
    // 逾期和对账单卡一样用红标签（06 章 F2 / F5）
    tags: [
      ...(party.overdue ? [{ text: copy.flow.finance.overdueTag, warn: false, danger: true }] : []),
      ...(party.enabled ? [] : [{ text: copy.tag.disabled, warn: false }]),
    ],
  }
}
export function statementAmountCells(detail: StatementDetail) {
  const supplier = detail.kind === 'supplier'
  const cell = (label: string, amountCents: number, due = false) => ({ label, amountCents, due })
  return [
    cell(supplier ? f.received : f.shipped, supplier ? detail.receivedCents : detail.shippedCents),
    cell(supplier ? f.returned : f.after, supplier ? detail.returnCents : detail.afterCents),
    ...(detail.openingDebtCents ? [cell(f.openingDebt, detail.openingDebtCents)] : []),
    cell(supplier ? f.supplierDeducted : f.deducted, detail.creditDeductedCents),
    cell(supplier ? f.payable : f.receivable, detail.amountCents, true),
  ]
}
// 备注短的和开单人并排，长的占整行
const NOTE_INLINE_MAX = 8
export function statementInfoOf(detail: StatementDetail) {
  return [
    { label: f.no, value: detail.no },
    { label: f.statementDate, value: detail.statementDate },
    ...(detail.dueDate ? [{ label: f.dueDate, value: detail.dueDate, wide: true }] : []),
    { label: f.period, value: periodTextOf(detail.periodFrom, detail.periodTo), wide: true },
    { label: f.createdBy, value: detail.createdBy.name },
    ...(detail.settledAt ? [{ label: f.settledDate, value: shanghaiDayOf(detail.settledAt) }] : []),
    { label: f.note, value: detail.note || '—', wide: detail.note.length > NOTE_INLINE_MAX },
    ...(detail.voidReason
      ? [
          { label: f.voidReason, value: detail.voidReason, wide: true },
          { label: f.voidedBy, value: detail.voidedBy?.name ?? '' },
          { label: f.voidedAt, value: detail.voidedAt ? formatTime(detail.voidedAt) : '' },
        ]
      : []),
  ]
}
type Settlement = StatementDetail['settlements'][number]
// 收款记录：单号 + 收款金额，日期、方式写下面一行，多收、优惠写在后面
export function settlementListRowsOf(items: Settlement[], payment: boolean): ListRow[] {
  return items.map((item) => {
    const extra = [
      item.creditCents
        ? `${payment ? f.supplierCredited : f.credited} ${formatMoney(item.creditCents)}`
        : '',
      item.discountCents ? `${f.discount} ${formatMoney(item.discountCents)}` : '',
    ].filter(Boolean)
    return {
      key: `${item.kind}:${item.id}`,
      title: `${f.no} ${item.no}`,
      amountLabel: payment ? f.paymentAmount : f.receiptAmount,
      amount: formatMoney(item.amountCents),
      notes: [
        `${payment ? f.paymentDate : f.receiptDate} ${item.date}`,
        [`${payment ? f.paymentMethod : f.receiptMethod} ${item.methodName}`, ...extra].join(f.gap),
      ],
      tags: item.reversedAt ? [{ text: f.voided, warn: false }] : [],
      muted: Boolean(item.reversedAt),
    }
  })
}
