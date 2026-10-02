import {
  copy,
  formatMoney,
  formatQty,
  formatTime,
  formatUnitTotals,
  labels,
  type InviteCard,
  type PoCard,
  type PoDetail,
  type SupplierPoDetail,
} from '@huazhong/shared'
import { lineCents } from '../core/money'
import { rowsOf } from './order'

export function poRowOf(po: PoCard) {
  return {
    id: po.id,
    date: po.orderDate,
    status: po.status,
    title: po.supplierName,
    total: formatUnitTotals(po.units),
    meta: [po.no, po.buyerName].join(copy.separator),
    amount: po.status === 'received' ? po.payableCents : po.amountCents,
    tags: [
      ...(po.changed ? [{ text: copy.screen.tag.changed, warn: false }] : []),
      ...(po.repriced ? [{ text: copy.screen.tag.repriced, warn: true }] : []),
      ...(po.allReturned ? [{ text: copy.screen.allReturned, warn: false }] : []),
    ],
  }
}

export function inviteRowOf(invite: InviteCard) {
  const generated =
    invite.purchaseOrderStatus === null ? '' : labels.poStatus[invite.purchaseOrderStatus]
  return {
    id: invite.id,
    date: invite.inviteDate,
    status: invite.status,
    title: [invite.supplierName, ...invite.materialNames].join(copy.separator),
    total: formatUnitTotals(invite.units),
    amount: null,
    meta: [invite.no, invite.buyerName, invite.purchaseOrderNo, generated]
      .filter(Boolean)
      .join(copy.separator),
    tags: [],
  }
}

function poLinesOf(po: PoDetail | SupplierPoDetail) {
  return po.lines.map((line) => ({
    key: line.id,
    name: line.name,
    qty: line.receivedQty ?? line.qty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
    amountCents: lineCents((line.receivedQty ?? line.qty) - line.returnedQty, line.priceCents),
    meta:
      line.receivedQty === null
        ? ''
        : copy.screen.receiveQty(line.qty, line.receivedQty, line.returnedQty, line.unit),
    tags:
      line.receivedQty !== null && line.receivedQty < line.qty
        ? [{ text: copy.screen.shortReceived(line.qty - line.receivedQty), warn: true }]
        : [],
  }))
}

function poRecordsOf(po: PoDetail | SupplierPoDetail) {
  return {
    changes: po.changes.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actorLabel,
      changes: r.items,
      reason: r.reason,
    })),
    prices: po.priceChanges.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actorLabel,
      reason: r.reason,
      changes: r.items.map(
        (i) => `${i.name} ${formatMoney(i.fromCents)} → ${formatMoney(i.toCents)}`,
      ),
    })),
    returns: po.returns.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actorLabel,
      reason: null,
      changes: r.items.map((i) => `${i.name} ${i.qty}`),
    })),
  }
}
function externalPaymentsOf(po: PoDetail | SupplierPoDetail) {
  return po.allocations.flatMap((allocation) =>
    'date' in allocation
      ? [{ date: allocation.date, amount: formatMoney(allocation.amountCents) }]
      : [],
  )
}
export function poViewOf(po: PoDetail | SupplierPoDetail, supplier = false) {
  return {
    notice: supplier ? '' : (po.notice ?? po.lockedReason ?? ''),
    payments: supplier ? externalPaymentsOf(po) : [],
    info: {
      title: po.no,
      statusKind: 'poStatus',
      status: po.status,
      rows: rowsOf([
        [copy.screen.label.supplier, po.supplierName],
        [copy.screen.label.buyer, po.buyerName],
        [copy.screen.label.orderDate, po.orderDate],
        [
          copy.screen.label.origin,
          po.inviteNo ? copy.screen.supplyOrigin(po.inviteNo) : copy.screen.purchaseOrigin,
        ],
        [copy.field.note, po.note],
        [copy.screen.title.receive, po.receivedBy],
        [copy.screen.label.date, po.receivedAt ? formatTime(po.receivedAt) : null],
        [copy.screen.label.receiveNote, po.recvNote],
      ]),
    },
    linesHeading: copy.screen.section.materials,
    reason: {
      heading: copy.screen.section.cancel,
      rows: rowsOf([
        [copy.screen.label.cancelReason, po.cancelReason],
        [copy.screen.label.cancelledAt, po.cancelledAt ? formatTime(po.cancelledAt) : null],
        [copy.screen.label.voidReason, po.voidReason],
        [copy.screen.label.voidedAt, po.voidedAt ? formatTime(po.voidedAt) : null],
      ]),
    },
    lines: poLinesOf(po),
    amountRows: poAmountsOf(po, supplier),
    ...poRecordsOf(po),
  }
}

function poAmountsOf(po: PoDetail | SupplierPoDetail, supplier: boolean) {
  return [
    { label: copy.screen.label.purchaseAmount, value: formatMoney(po.amountCents) },
    { label: copy.screen.label.payable, value: formatMoney(po.payableCents) },
    { label: copy.screen.label.paid, value: formatMoney(po.paidCents) },
    { label: copy.screen.label.due, value: formatMoney(po.unpaidCents) },
    ...(!supplier
      ? [
          {
            label: labels.module.finance,
            value: po.allReturned ? copy.screen.allReturned : labels.apStatus[po.apStatus],
          },
        ]
      : []),
  ]
}

export function materialPickOf(material: { id: string; name: string; unit: string }) {
  return { id: material.id, name: material.name, sub: formatQty(1, material.unit) }
}
