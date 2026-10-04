import { poProgress, externalProgressOf, statementText } from './progress'
import {
  copy,
  redesignCopy,
  formatMoney,
  formatQty,
  formatTime,
  formatUnitTotals,
  labels,
  type InviteCard,
  type PoCard,
  type PoDetail,
} from '@huazhong/shared'
import { lineCents } from '../core/money'
import { rowsOf } from './order'

export function poRowOf(po: PoCard, supplier = false) {
  return {
    id: po.id,
    fields: [
      { label: redesignCopy.no, value: po.no, wide: true },
      { label: redesignCopy.orderDate, value: po.orderDate },
      { label: copy.screen.label.buyer, value: po.buyerName },
      ...(po.receivedAt
        ? [
            {
              label: copy.screen.label.receivedAt,
              value: formatTime(po.receivedAt).split(' ')[0] ?? '',
            },
          ]
        : []),
      {
        label: redesignCopy.purchaseAmount,
        value: formatMoney(po.amountCents),
        amount: true,
        wide: true,
      },
    ],
    date: po.orderDate,
    status: po.status,
    title: supplier
      ? po.materialNames.slice(0, 1).join('') +
        (po.materialNames.length > 1 ? copy.order.moreItems('', po.materialNames.length) : '')
      : po.supplierName,
    total: formatUnitTotals(po.units),
    meta: [po.no, po.buyerName].join(copy.separator),
    amount: po.amountCents,
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
    fields: [
      { label: redesignCopy.no, value: invite.no, wide: true },
      { label: redesignCopy.inviteDate, value: invite.inviteDate },
      { label: copy.screen.label.buyer, value: invite.buyerName },
      { label: redesignCopy.need, value: formatUnitTotals(invite.units) },
      ...(invite.supplyAmountCents !== null
        ? [
            {
              label: redesignCopy.purchaseAmount,
              value: formatMoney(invite.supplyAmountCents),
              amount: true,
            },
          ]
        : []),
      ...(invite.purchaseOrderNo
        ? [
            {
              label: redesignCopy.purchaseOrders,
              value: [invite.purchaseOrderNo, generated].filter(Boolean).join(copy.separator),
              wide: true,
            },
          ]
        : []),
    ],
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

function poLinesOf(po: PoDetail) {
  return po.lines.map((line) => ({
    key: line.id,
    name: line.name,
    code: line.code,
    qty: line.receivedQty === null ? line.qty : line.receivedQty - line.returnedQty,
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

function poRecordsOf(po: PoDetail) {
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
function poSourceOf(
  po: PoDetail,
  supplier: boolean,
  finance: boolean,
): [string, string, { url?: string }] {
  const source = po.inviteNo
    ? supplier
      ? `${copy.screen.section.supply}${copy.separator}${po.inviteNo}`
      : copy.screen.supplyOrigin(po.inviteNo)
    : copy.screen.purchaseOrigin
  return [
    copy.screen.label.origin,
    source,
    po.inviteId && !finance
      ? {
          url: supplier
            ? `/packages/supplier/pages/supply/index?id=${po.inviteId}`
            : `/packages/purchase/pages/invite-detail/index?id=${po.inviteId}`,
        }
      : {},
  ]
}

function poInfoOf(po: PoDetail, supplier: boolean, finance: boolean) {
  return {
    title: po.supplierName,
    statusKind: 'poStatus',
    status: supplier && po.status === 'voided' ? 'cancelled' : po.status,
    rows: rowsOf([
      [redesignCopy.no, po.no],
      [copy.screen.label.orderDate, po.orderDate],
      [copy.screen.label.buyer, po.buyerName, supplier ? { phone: po.buyerPhone } : {}],
      poSourceOf(po, supplier, finance),
      [copy.field.note, po.note],
      [copy.screen.label.receivedBy, po.receivedBy],
      [copy.screen.label.receivedAt, po.receivedAt ? formatTime(po.receivedAt) : null],
      [copy.screen.label.receiveNote, po.recvNote],
      [
        redesignCopy.statement,
        statementText(po.statement),
        po.statement
          ? {
              url: supplier
                ? `/packages/supplier/pages/statement-detail/index?id=${po.statement.id}`
                : `/packages/finance/pages/statement-detail/index?scope=${finance ? 'finance' : 'internal'}&id=${po.statement.id}`,
            }
          : {},
      ],
    ]),
  }
}

function poClosedReason(po: PoDetail, supplier: boolean) {
  return {
    heading: copy.screen.section.cancel,
    rows: rowsOf([
      [copy.screen.label.cancelReason, po.cancelReason],
      [copy.screen.label.cancelledAt, po.cancelledAt ? formatTime(po.cancelledAt) : null],
      [supplier ? copy.screen.label.cancelReason : copy.screen.label.voidReason, po.voidReason],
      [
        supplier ? copy.screen.label.cancelledAt : copy.screen.label.voidedAt,
        po.voidedAt ? formatTime(po.voidedAt) : null,
      ],
    ]),
  }
}

export function poViewOf(po: PoDetail, supplier = false, finance = false) {
  return {
    notice: supplier ? '' : (po.lockedReason ?? po.notice ?? ''),
    progress: supplier ? externalProgressOf(poProgress(po)) : poProgress(po),
    qtyLabel: po.receivedAt ? redesignCopy.receivedQty : redesignCopy.qty,
    info: poInfoOf(po, supplier, finance),
    linesHeading: copy.screen.section.materials,
    reason: poClosedReason(po, supplier),
    lines: poLinesOf(po),
    ...poRecordsOf(po),
  }
}

export function materialPickOf(material: { id: string; name: string; unit: string }) {
  return { id: material.id, name: material.name, sub: formatQty(1, material.unit) }
}
