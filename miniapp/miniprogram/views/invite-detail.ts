import {
  copy,
  redesignCopy,
  formatMoney,
  formatTime,
  labels,
  type InviteDetail,
} from '@huazhong/shared'
import { inviteProgress } from './progress'
import { lineCents } from '../core/money'
import { rowsOf } from './order'

type SupplyLine = InviteDetail['supply'][number]
function supplyTextOf(supply: SupplyLine | undefined, submitted: boolean) {
  if (!submitted) return ''
  return supply ? supplyViewOf(supply).subText : copy.screen.notSupplied
}

function supplyViewOf(line: SupplyLine) {
  return {
    ...line,
    key: line.materialId,
    priceText: '',
    subText: `${copy.screen.supplyQty(line.qty, line.unit)} × ${formatMoney(line.priceCents)}`,
    amountCents: lineCents(line.qty, line.priceCents),
    tags: [{ text: copy.screen.extraSupply, warn: false }],
  }
}

function invitedLineOf(
  line: InviteDetail['lines'][number],
  supply: SupplyLine | undefined,
  submitted: boolean,
) {
  const qty = supply ? supply.qty : submitted ? 0 : line.needQty
  const priceCents = supply ? supply.priceCents : 0
  return {
    key: line.id,
    name: line.name,
    code: line.code,
    unit: line.unit,
    qty,
    priceCents,
    amountCents: supply ? lineCents(qty, priceCents) : 0,
    priceText: '',
    meta: submitted ? copy.screen.needQty(line.needQty, line.unit) : '',
    subText: supplyTextOf(supply, submitted),
    notice: submitted && !supply ? copy.screen.notSupplied : '',
    hideAmount: submitted && !supply,
    tags: line.enabled ? [] : [{ text: copy.screen.tag.discontinued, warn: true }],
  }
}

function poLinkOf(invite: InviteDetail) {
  if (!invite.purchaseOrderNo) return ''
  const status =
    invite.purchaseOrderStatus === null ? null : labels.poStatus[invite.purchaseOrderStatus]
  return [`${copy.screen.title.purchaseOrders} ${invite.purchaseOrderNo}`, status]
    .filter(Boolean)
    .join(copy.separator)
}

function invitePoUrl(id: string, supplier: boolean): string {
  return supplier
    ? `/packages/supplier/pages/po-detail/index?id=${id}`
    : `/packages/purchase/pages/order-detail/index?id=${id}`
}

function inviteInfoOf(invite: InviteDetail, supplier: boolean) {
  return {
    title: invite.supplierName,
    statusKind: 'inviteStatus',
    status: invite.status,
    rows: rowsOf([
      [redesignCopy.no, invite.no],
      [redesignCopy.inviteDate, invite.inviteDate],
      [copy.screen.label.buyer, invite.buyerName, supplier ? { phone: invite.buyerPhone } : {}],
      [redesignCopy.submittedAt, invite.submittedAt ? formatTime(invite.submittedAt) : null],
      [
        redesignCopy.purchaseOrders,
        poLinkOf(invite) || null,
        invite.purchaseOrderId ? { url: invitePoUrl(invite.purchaseOrderId, supplier) } : {},
      ],
    ]),
  }
}

export function inviteViewOf(invite: InviteDetail, supplier = false) {
  const submitted = invite.status === 'submitted'
  const supplied = new Map(invite.supply.map((line) => [line.materialId, line]))
  const invited = new Set(invite.lines.map((line) => line.materialId))
  return {
    submitted,
    progress: inviteProgress(invite),
    poLink: poLinkOf(invite),
    info: inviteInfoOf(invite, supplier),
    reason: {
      heading: copy.screen.section.cancel,
      rows: rowsOf([
        [
          copy.screen.label.cancelReason,
          invite.status === 'cancelled'
            ? (invite.cancelNote ?? copy.finance.inviteCancelledStale)
            : null,
        ],
        [copy.screen.label.cancelledAt, invite.cancelledAt ? formatTime(invite.cancelledAt) : null],
      ]),
    },
    lines: [
      ...invite.lines.map((line) => invitedLineOf(line, supplied.get(line.materialId), submitted)),
      ...invite.supply.filter((line) => !invited.has(line.materialId)).map(supplyViewOf),
    ],
    linesHeading: copy.screen.section.materials,
  }
}

export function openInvitePo(invite: InviteDetail | null, supplier: boolean) {
  const id = invite?.purchaseOrderId
  if (!id) return
  void wx.navigateTo({ url: invitePoUrl(id, supplier) })
}
