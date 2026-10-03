import {
  copy,
  formatMoney,
  formatTime,
  formatUnitTotals,
  labels,
  type WhDocCard,
  type WhDocDetail,
  type OutputOf,
  type contract,
} from '@huazhong/shared'
import { rowsOf } from './order'

export function stockRowOf(doc: WhDocCard) {
  return {
    id: doc.id,
    date: doc.docDate,
    status: doc.status,
    title:
      doc.supplierName ??
      doc.outCategoryName ??
      doc.materials.map((line) => line.name).join(copy.separator),
    total: formatUnitTotals(doc.units),
    meta: [doc.no, doc.actorName].join(copy.separator),
    amount: doc.amountCents,
    tags: doc.repriced ? [{ text: copy.screen.tag.repriced, warn: true }] : [],
  }
}
type StockViewDoc = WhDocDetail | OutputOf<typeof contract.getSupplierStockIn>
function stockInfoOf(doc: StockViewDoc) {
  return {
    title: doc.no,
    status: doc.status,
    statusKind: 'whDocStatus',
    rows: rowsOf([
      [copy.screen.label.supplier, doc.supplierName],
      [copy.stock.screen.outCategory, 'outCategoryName' in doc ? doc.outCategoryName : null],
      [copy.stock.screen.date[doc.kind], doc.docDate],
      [copy.stock.screen.actor, doc.actorName],
      [copy.screen.label.reason, doc.reason],
    ]),
  }
}
function stockAmountsOf(doc: StockViewDoc) {
  if (doc.kind !== 'in') return []
  return rowsOf([
    [copy.stock.screen.amount, formatMoney(doc.amountCents ?? 0)],
    [labels.module.finance, doc.apStatus ? labels.apStatus[doc.apStatus] : null],
    [copy.screen.label.paid, doc.paidCents === null ? null : formatMoney(doc.paidCents)],
    [copy.screen.label.due, doc.unpaidCents === null ? null : formatMoney(doc.unpaidCents)],
  ])
}
export function stockViewOf(doc: StockViewDoc) {
  return {
    heading: 'title' in doc ? doc.title : '',
    notice: doc.lockedReason ?? '',
    info: stockInfoOf(doc),
    linesHeading: copy.screen.section.materials,
    quantityOnly: doc.kind !== 'in',
    lines: doc.lines.map((line) => ({
      key: line.id,
      name: line.name,
      unit: line.unit,
      qty: line.qty,
      priceCents: line.priceCents ?? 0,
      amountCents: line.amountCents ?? 0,
      tags: [],
    })),
    amountRows: stockAmountsOf(doc),
    prices: doc.priceChanges.map((price) => ({
      id: price.id,
      name: [price.actorLabel, formatTime(price.createdAt)].join(copy.separator),
      reason: price.reason,
      changes: price.items
        .map((item) => `${item.name} ${formatMoney(item.fromCents)} → ${formatMoney(item.toCents)}`)
        .join(copy.separator),
    })),
    images: 'images' in doc ? doc.images : [],
    urls: 'images' in doc ? doc.images.map((image) => image.url) : [],
    void: {
      heading: copy.screen.section.cancel,
      rows: rowsOf([
        [copy.screen.label.voidReason, doc.voidReason],
        [copy.screen.label.voidedAt, doc.voidedAt ? formatTime(doc.voidedAt) : null],
      ]),
    },
    payments: doc.allocations
      .filter((allocation) => 'date' in allocation)
      .map((allocation) => ({
        date: 'date' in allocation ? allocation.date : '',
        amount: formatMoney('amountCents' in allocation ? allocation.amountCents : 0),
      })),
    texts: copy.stock.screen,
  }
}
