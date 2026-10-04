import { copy, redesignCopy, formatTime, labels, type InviteDetail } from '@huazhong/shared'
import { inviteProgress } from './progress'
import { lineCents } from '../core/money'
import { rowsOf } from './order'

type SupplyLine = InviteDetail['supply'][number]
function supplyViewOf(line: SupplyLine) {
  return {
    ...line,
    key: line.materialId,
    priceText: '',
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
    // 需求数量写在编码那行；没供的行标「未供」
    meta: submitted ? copy.screen.needQty(line.needQty, line.unit) : '',
    hideAmount: submitted && !supply,
    tags: [
      ...(submitted && !supply ? [{ text: copy.screen.notSupplied, warn: true }] : []),
      ...(line.enabled ? [] : [{ text: copy.screen.tag.discontinued, warn: true }]),
    ],
  }
}

function poLinkOf(invite: InviteDetail) {
  if (!invite.purchaseOrderNo) return ''
  const status =
    invite.purchaseOrderStatus === null ? null : labels.poStatus[invite.purchaseOrderStatus]
  return [invite.purchaseOrderNo, status].filter(Boolean).join(copy.separator)
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
    cols: true,
    rows: rowsOf([
      [copy.screen.inviteNo, invite.no],
      [copy.screen.label.buyer, invite.buyerName, supplier ? { phone: invite.buyerPhone } : {}],
      [redesignCopy.inviteDate, invite.inviteDate, { wide: true }],
      [
        redesignCopy.submittedAt,
        invite.submittedAt ? formatTime(invite.submittedAt) : null,
        { wide: true },
      ],
      [
        redesignCopy.purchaseOrders,
        poLinkOf(invite) || null,
        invite.purchaseOrderId
          ? { url: invitePoUrl(invite.purchaseOrderId, supplier), wide: true }
          : {},
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
    qtyLabel: submitted ? copy.screen.supplyLabel : redesignCopy.need,
  }
}

export function openInvitePo(invite: InviteDetail | null, supplier: boolean) {
  const id = invite?.purchaseOrderId
  if (!id) return
  void wx.navigateTo({ url: invitePoUrl(id, supplier) })
}
