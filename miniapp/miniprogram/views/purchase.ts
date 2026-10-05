import { poProgress, externalProgressOf, statementText } from './progress'
import {
  copy,
  redesignCopy,
  formatMoney,
  formatTime,
  noticeCopy,
  type InviteCard,
  type PoCard,
  type PoDetail,
} from '@huazhong/shared'
import { lineCents } from '../core/money'
import { cardAmountOf, cardDateOf, subOf, summaryOf, type CardRow } from './card'
import { rowsOf } from './order'

// 列表卡（06 章 C3、P1）：采购员大字供应商，小字花材摘要 · 下单日期，右状态 + 金额；
// 供应商大字下单日期，小字花材摘要 · 单号。到货有差异还没看过的标「到货有差异」
export function poRowOf(po: PoCard, supplier = false): CardRow {
  const date = cardDateOf(po.orderDate)
  return {
    id: po.id,
    main: supplier ? copy.flow.common.orderedOn(date) : po.supplierName,
    serif: supplier,
    sub: supplier
      ? subOf([summaryOf(po.materialNames), po.no])
      : subOf([summaryOf(po.materialNames), date]),
    status: po.status,
    amount: cardAmountOf(po.amountCents),
    tags: [
      ...(po.diffUnseen ? [{ text: noticeCopy.poDiffTodo, warn: true }] : []),
      ...(po.changed ? [{ text: copy.screen.tag.changed, warn: false }] : []),
      ...(po.repriced ? [{ text: copy.screen.tag.repriced, warn: true }] : []),
      ...(po.allReturned ? [{ text: copy.screen.allReturned, warn: false }] : []),
    ],
  }
}

// 填报邀请卡（06 章 C3「填报邀请」段、P2）：员工大字供应商，小字花材摘要 · 邀请日期；
// 供应商大字邀请日期，小字花材摘要。右边状态 + 供货金额（填了才有）
export function inviteRowOf(invite: InviteCard, supplier = false): CardRow {
  const date = cardDateOf(invite.inviteDate)
  return {
    id: invite.id,
    main: supplier ? copy.flow.common.invitedOn(date) : invite.supplierName,
    serif: supplier,
    sub: supplier
      ? summaryOf(invite.materialNames)
      : subOf([summaryOf(invite.materialNames), date]),
    status: invite.status,
    amount: cardAmountOf(invite.supplyAmountCents),
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
      // 收货后：采购数量和实收数量并排成两列，差多少一眼看出；退货另写在编码那行
      ...(received ? { purchaseQty: line.qty } : {}),
      meta:
        received && line.returnedQty > 0
          ? copy.screen.returnedQty(line.returnedQty, line.unit)
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
        (i) =>
          `${i.name} ${redesignCopy.price} ${formatMoney(i.fromCents)} → ${formatMoney(i.toCents)}`,
      ),
    })),
    returns: po.returns.map((r) => ({
      id: r.id,
      at: r.createdAt,
      actor: r.actorLabel,
      reason: null,
      changes: r.items.map((i) => `${i.name} ${redesignCopy.qty} ${i.qty}`),
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
    qtyLabel: po.receivedAt ? redesignCopy.receivedQtyFull : redesignCopy.qty,
    info: poInfoOf(po, supplier, finance),
    linesHeading: copy.screen.section.materials,
    reason: { heading: '', rows: [] },
    lines: poLinesOf(po),
    ...poRecordsOf(po),
  }
}
