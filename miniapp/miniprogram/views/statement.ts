import type { contract } from '@huazhong/shared'
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
export interface FinanceRow {
  id: string
  title: string
  status: string
  headText?: string
  fields: { label: string; value: string; amount?: boolean; wide?: boolean }[]
  tags: { text: string; warn: boolean; danger?: boolean }[]
  kind?: 'receipt' | 'payment'
  source?: StatementSource
}
type ExternalCard = OutputOf<typeof contract.storeStatements>['items'][number]
type SourceType = StatementSource['type']
const mainTypes: SourceType[] = ['order', 'po', 'wh']
function isMainSource(source: StatementSource) {
  return mainTypes.includes(source.type)
}
function cardAmountOf(card: StatementCard | ExternalCard, external: 'store' | 'supplier' | null) {
  if (external === 'store' && 'storeAmountCents' in card)
    return { label: f.storeAmount, value: formatMoney(card.storeAmountCents ?? 0), amount: true }
  return {
    label: external === 'supplier' || card.kind === 'customer' ? f.receivable : f.payable,
    value: formatMoney(card.amountCents),
    amount: true,
  }
}
export function periodTextOf(from: string, to: string) {
  return f.statementPeriodRange(from, to)
}
export function statementRowOf(
  card: StatementCard | ExternalCard,
  external: 'store' | 'supplier' | null = null,
): FinanceRow {
  // 卡片只留三项主字段：对账期间、金额、付款截止（没有账期就写开单日期）；单号、发货 / 采购张数等进详情
  const fields: FinanceRow['fields'] = [
    { label: f.period, value: periodTextOf(card.periodFrom, card.periodTo), wide: true },
    cardAmountOf(card, external),
    card.dueDate
      ? { label: f.dueDate, value: card.dueDate }
      : { label: f.statementDate, value: card.statementDate },
  ]
  return {
    id: card.id,
    title: f.statement,
    status: card.status,
    fields,
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
  | 'overdueDays'
  | 'overdueCents'
>
function partyFieldsOf(party: Party): FinanceRow['fields'] {
  const supplier = party.kind === 'supplier'
  return [
    {
      label: supplier ? f.payableOutstanding : f.outstanding,
      value: formatMoney(party.outstandingCents),
      amount: party.outstandingCents > 0,
    },
    {
      label: f.unstatemented,
      value: formatMoney(party.unstatementedCents),
      amount: party.unstatementedCents > 0,
    },
    { label: f.lastStatementTo, value: party.lastStatementTo ?? f.neverStatemented },
    {
      label: supplier ? f.lastPaymentDate : f.lastReceiptDate,
      value: party.lastFundDate ?? f.none,
    },
    ...(party.creditCents
      ? [
          {
            label: supplier ? f.supplierCredited : f.credited,
            value: formatMoney(party.creditCents),
            amount: true,
          },
        ]
      : []),
  ]
}
export function partyRowOf(party: Party): FinanceRow {
  return {
    id: party.partyId,
    title: party.partyName,
    status: '',
    ...(party.unsettledCount ? { headText: f.unsettledCount(party.unsettledCount) } : {}),
    fields: partyFieldsOf(party),
    tags: [
      ...(!party.enabled ? [{ text: copy.tag.disabled, warn: false }] : []),
      ...(party.overdueDays
        ? [
            {
              text: f.overdueAmount(formatMoney(party.overdueCents)),
              warn: false,
              danger: true,
            },
          ]
        : []),
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
