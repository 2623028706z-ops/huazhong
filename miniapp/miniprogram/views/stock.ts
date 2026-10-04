import { statementText } from './progress'
import {
  copy,
  redesignCopy,
  formatMoney,
  formatTime,
  type WhDocDetail,
  type OutputOf,
  type contract,
} from '@huazhong/shared'
import { rowsOf } from './order'

type StockViewDoc = WhDocDetail | OutputOf<typeof contract.getSupplierStockIn>
function stockInfoOf(doc: StockViewDoc, finance: boolean) {
  return {
    title: doc.supplierName ?? doc.no,
    status: doc.status,
    statusKind: 'whDocStatus',
    rows: rowsOf([
      [redesignCopy.no, doc.no],
      [copy.screen.label.supplier, doc.supplierName],
      [copy.stock.screen.outCategory, 'outCategoryName' in doc ? doc.outCategoryName : null],
      [copy.stock.screen.date[doc.kind], doc.docDate],
      [copy.stock.screen.actor, doc.actorName],
      [copy.screen.label.reason, doc.reason],
      ...(doc.kind === 'in'
        ? [
            [
              redesignCopy.statement,
              statementText(doc.statement),
              doc.statement
                ? {
                    url: `/packages/finance/pages/statement-detail/index?scope=${finance ? 'finance' : 'internal'}&id=${doc.statement.id}`,
                  }
                : {},
            ] as [string, string, { url?: string }],
          ]
        : []),
    ]),
  }
}
export function stockViewOf(doc: StockViewDoc, finance = false) {
  return {
    heading: 'title' in doc ? doc.title : '',
    notice: doc.lockedReason ?? '',
    info: stockInfoOf(doc, finance),
    linesHeading: copy.screen.section.materials,
    quantityOnly: doc.kind !== 'in',
    lines: doc.lines.map((line) => ({
      key: line.id,
      name: line.name,
      code: line.code,
      unit: line.unit,
      qty: line.qty,
      priceCents: line.priceCents ?? 0,
      amountCents: line.amountCents ?? 0,
      tags: [],
    })),
    prices: doc.priceChanges.map((price) => ({
      id: price.id,
      actor: price.actorLabel,
      at: price.createdAt,
      reason: price.reason,
      changes: price.items.map(
        (item) => `${item.name} ${formatMoney(item.fromCents)} → ${formatMoney(item.toCents)}`,
      ),
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
    texts: copy.stock.screen,
  }
}
