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

// 多种花材的抬头：第一种 + 「等 n 项」，没有花材就空
function materialTitleOf(names: string[]) {
  const [first] = names
  if (!first) return ''
  return names.length > 1 ? copy.order.moreItems(first, names.length) : first
}

export function poRowOf(po: PoCard, supplier = false) {
  return {
    id: po.id,
    fields: [
      { label: redesignCopy.no, value: po.no },
      { label: redesignCopy.orderDate, value: po.orderDate },
      { label: copy.screen.label.buyer, value: po.buyerName },
      {
        label: redesignCopy.purchaseAmount,
        value: formatMoney(po.amountCents),
        amount: true,
      },
      // 供应商端：收货后多一项收货日期
      ...(supplier && po.receivedAt
        ? [
            {
              label: copy.screen.receivedDate,
              value: formatTime(po.receivedAt).split(' ')[0] ?? '',
            },
          ]
        : []),
    ],
    date: po.orderDate,
    status: po.status,
    title: supplier ? materialTitleOf(po.materialNames) : po.supplierName,
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

// 供应商端抬头只写花材（不带自家名字）；采购端抬头写「供应商 · 花材」
export function inviteRowOf(invite: InviteCard, supplier = false) {
  const generated =
    invite.purchaseOrderStatus === null ? '' : labels.poStatus[invite.purchaseOrderStatus]
  return {
    id: invite.id,
    fields: [
      { label: copy.screen.inviteNo, value: invite.no },
      { label: redesignCopy.inviteDate, value: invite.inviteDate },
      { label: redesignCopy.need, value: formatUnitTotals(invite.units) },
      ...(supplier ? [{ label: copy.screen.label.buyer, value: invite.buyerName }] : []),
      ...(invite.supplyAmountCents !== null
        ? [
            {
              label: copy.screen.supplyAmount,
              value: formatMoney(invite.supplyAmountCents),
              amount: true,
            },
          ]
        : []),
      ...(invite.purchaseOrderNo
        ? [
            {
              label: redesignCopy.purchaseOrders,
              value:
                [invite.purchaseOrderNo, generated].filter(Boolean).join(copy.separator) + ' ›',
              wide: true,
            },
          ]
        : []),
    ],
    date: invite.inviteDate,
    status: invite.status,
    title: supplier
      ? materialTitleOf(invite.materialNames)
      : [invite.supplierName, materialTitleOf(invite.materialNames)]
          .filter(Boolean)
          .join(copy.separator),
    total: formatUnitTotals(invite.units),
    amount: null,
    meta: [invite.no, invite.buyerName, invite.purchaseOrderNo, generated]
      .filter(Boolean)
      .join(copy.separator),
    tags: [],
  }
}

type PoLine = PoDetail['lines'][number]
// 收货后：少收 / 多收 / 改价标出来
function lineTagsOf(line: PoLine) {
  const tags: { text: string; warn: boolean }[] = []
  if (line.receivedQty !== null && line.receivedQty < line.qty)
    tags.push({ text: copy.screen.shortReceived(line.qty - line.receivedQty), warn: true })
  if (line.receivedQty !== null && line.receivedQty > line.qty)
    tags.push({ text: copy.screen.overReceived(line.receivedQty - line.qty), warn: true })
  if (line.priceCents !== line.orderPriceCents)
    tags.push({
      text: copy.screen.repriceFrom(
        formatMoney(line.orderPriceCents),
        formatMoney(line.priceCents),
      ),
      warn: true,
    })
  return tags
}

function poLinesOf(po: PoDetail) {
  return po.lines.map((line) => {
    const received = line.receivedQty !== null
    return {
      key: line.id,
      name: line.name,
      code: line.code,
      qty: received ? (line.receivedQty ?? 0) - line.returnedQty : line.qty,
      unit: line.unit,
      priceCents: line.priceCents,
      priceText: '',
      amountCents: lineCents((line.receivedQty ?? line.qty) - line.returnedQty, line.priceCents),
      // 收货后：采购数量写在编码那行，和实收不一样、改过价的标出来
      meta: received
        ? [
            copy.screen.purchaseQty(line.qty, line.unit),
            ...(line.returnedQty > 0 ? [copy.screen.returnedQty(line.returnedQty, line.unit)] : []),
          ].join(copy.separator)
        : '',
      tags: received ? lineTagsOf(line) : [],
    }
  })
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
// 来源只在填报生成的单上写，自己下的单没有这一行
function poSourceOf(
  po: PoDetail,
  supplier: boolean,
  finance: boolean,
): [string, string | null, { url?: string; wide?: boolean }] {
  if (!po.inviteNo) return [copy.screen.label.origin, null, {}]
  const text = supplier
    ? copy.screen.myInvite(po.inviteNo)
    : copy.screen.supplyOriginLine(po.inviteNo)
  const url = supplier
    ? `/packages/supplier/pages/supply/index?id=${po.inviteId}`
    : `/packages/purchase/pages/invite-detail/index?id=${po.inviteId}`
  return [
    copy.screen.label.origin,
    text,
    { wide: true, ...(po.inviteId && !finance ? { url } : {}) },
  ]
}

function statementRowOf(
  po: PoDetail,
  supplier: boolean,
  finance: boolean,
): [string, string | null, { url?: string; wide?: boolean }] {
  // 只有已收货的单才有「对账单」；还没开写「未对账」
  if (po.status !== 'received') return [redesignCopy.statement, null, {}]
  return [
    redesignCopy.statement,
    statementText(po.statement),
    {
      wide: true,
      ...(po.statement
        ? {
            url: supplier
              ? `/packages/supplier/pages/statement-detail/index?id=${po.statement.id}`
              : `/packages/finance/pages/statement-detail/index?scope=${finance ? 'finance' : 'internal'}&id=${po.statement.id}`,
          }
        : {}),
    },
  ]
}

function dateOnly(at: string | null) {
  return at ? (formatTime(at).split(' ')[0] ?? '') : null
}

// 取消、作废的原因放在信息卡最后一行（供应商端作废也叫取消）
function closedReasonOf(po: PoDetail, supplier: boolean): [string, string | null] {
  const label = copy.screen.label
  if (po.status === 'cancelled') return [label.cancelReason, po.cancelReason]
  if (po.status === 'voided')
    return [supplier ? label.cancelReason : label.voidReason, po.voidReason]
  return [label.cancelReason, null]
}

// 只有员工看得到的几行：收货人 / 收货时间 / 备注 / 收货备注
function staffRowsOf(
  po: PoDetail,
  received: boolean,
): [string, string | null, { wide: boolean }][] {
  const wide = { wide: true }
  return [
    [copy.screen.label.receivedAt, received ? formatTime(po.receivedAt ?? '') : null, wide],
    [copy.field.note, po.note, wide],
    [copy.screen.receiveRemark, po.recvNote, wide],
  ]
}

function poInfoOf(po: PoDetail, supplier: boolean, finance: boolean) {
  const received = po.receivedAt !== null && po.status !== 'rejected'
  const staff = staffRowsOf(po, received)
  const [reasonLabel, reason] = closedReasonOf(po, supplier)
  return {
    title: po.supplierName,
    statusKind: 'poStatus',
    status: supplier && po.status === 'voided' ? 'cancelled' : po.status,
    cols: true,
    rows: rowsOf([
      [redesignCopy.no, po.no],
      [copy.screen.label.orderDate, po.orderDate],
      [copy.screen.label.buyer, po.buyerName, supplier ? { phone: po.buyerPhone } : {}],
      supplier
        ? [copy.screen.receivedDate, received ? dateOnly(po.receivedAt) : null]
        : [copy.screen.label.receivedBy, received ? po.receivedBy : null],
      poSourceOf(po, supplier, finance),
      ...(supplier ? [] : staff),
      statementRowOf(po, supplier, finance),
      [reasonLabel, reason, { wide: true }],
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
    reason: { heading: '', rows: [] },
    lines: poLinesOf(po),
    ...poRecordsOf(po),
  }
}

export function materialPickOf(material: { id: string; name: string; unit: string }) {
  return { id: material.id, name: material.name, sub: formatQty(1, material.unit) }
}
