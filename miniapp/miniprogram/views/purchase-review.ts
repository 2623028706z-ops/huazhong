import { contract, copy, formatQty, redesignCopy, type OutputOf } from '@huazhong/shared'
import { isChanged } from '../core/guard'
import { request, type Failure } from '../core/request'
import type { KeyEvent } from '../core/events'
import type { PurchaseDraft, PurchaseForm } from './purchase-form-data'

interface ReviewHost {
  data: { form: PurchaseForm }
  setData(patch: Record<string, unknown>): void
  selectComponent(selector: string): unknown
  fail(failure: Failure): Promise<void>
  confirmReview(review: OutputOf<typeof contract.reviewPurchase>): Promise<boolean>
}
export const purchaseReviewTexts = {
  reviewTitle: copy.screen.reviewTitle,
  invitedPending: copy.screen.invitedPending,
  currentGap: copy.screen.currentGap,
  needLabel: redesignCopy.need,
  inStockLabel: redesignCopy.inStock,
  inTransitLabel: redesignCopy.inTransit,
  inviteNo: copy.screen.inviteNo,
  materialLabel: copy.screen.materialLabel,
  continueSubmit: copy.screen.continueReview,
  backToReview: copy.screen.backEdit,
}
export const purchaseReviewData = {
  reviewSheet: false,
  reviewWarnings: [] as string[],
  reviewInvites: [] as {
    inviteId: string
    no: string
    supplierName: string
    material: string
    need: string
  }[],
  reviewDemand: [] as {
    id: string
    name: string
    need: string
    stock: string
    transit: string
    gap: string
    short: boolean
  }[],
  reviewExpected: [] as NonNullable<NonNullable<PurchaseDraft['demandContext']>['expected']>,
  reviewError: '',
}
interface InteractionHost {
  data: { form: PurchaseForm; reviewExpected: typeof purchaseReviewData.reviewExpected }
  reviewResolve: ((confirmed: boolean) => void) | null
  setData(patch: Record<string, unknown>): void
}
export const purchaseReviewMethods = {
  reviewResolve: null as ((confirmed: boolean) => void) | null,
  confirmReview(this: InteractionHost, review: OutputOf<typeof contract.reviewPurchase>) {
    const lineOf = (materialId: string) =>
      this.data.form.lines.find((line) => line.id === materialId)
    const invites = new Map(
      review.warnings.flatMap((warning) =>
        warning.invites.map((invite) => [
          invite.inviteId,
          {
            inviteId: invite.inviteId,
            no: invite.no,
            supplierName: invite.supplierName,
            material: lineOf(warning.materialId)?.name ?? '',
            need: formatQty(invite.needQty, lineOf(warning.materialId)?.unit ?? ''),
          },
        ]),
      ),
    )
    // 缺口变了：写「缺 15 → 25 枝」
    const demand = review.currentDemand.map((mat) => {
      const line = lineOf(mat.materialId)
      const unit = line?.unit ?? ''
      const before = this.data.reviewExpected.find((item) => item.materialId === mat.materialId)
      const gap = Math.max(0, -mat.leftQty)
      const beforeGap = before
        ? Math.max(0, before.needQty - before.stockQty - before.inTransitQty)
        : gap
      return {
        id: mat.materialId,
        name: line?.name ?? '',
        need: formatQty(mat.needQty, unit),
        stock: formatQty(mat.stockQty, unit),
        transit: formatQty(mat.inTransitQty, unit),
        gap:
          beforeGap === gap
            ? copy.screen.gapOf(gap, unit)
            : copy.screen.gapChanged(beforeGap, gap, unit),
        short: gap > 0,
      }
    })
    this.setData({
      reviewSheet: true,
      reviewWarnings: [],
      reviewInvites: [...invites.values()],
      reviewDemand: demand,
      reviewError: '',
    })
    return new Promise<boolean>((resolve) => {
      this.reviewResolve = resolve
    })
  },
  onReviewConfirm(this: InteractionHost) {
    this.setData({ reviewSheet: false })
    this.reviewResolve?.(true)
    this.reviewResolve = null
  },
  onReviewCancel(this: InteractionHost) {
    this.setData({ reviewSheet: false })
    this.reviewResolve?.(false)
    this.reviewResolve = null
  },
  onReviewInvite(this: InteractionHost, event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/purchase/pages/invite-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
}
export async function reviewDraft(
  host: ReviewHost,
  kind: 'po' | 'invite',
  demandContext?: PurchaseDraft['demandContext'],
): Promise<string | null> {
  const draft = host.data.form
  host.setData({ reviewing: true })
  const review = await request(contract.reviewPurchase, {
    body: {
      kind,
      supplierId: draft.supplierId,
      lines: draft.lines.map((line) => ({ materialId: line.id, qty: line.qty })),
      demandContext,
    },
  })
  host.setData({ reviewing: false })
  if (!review.ok) {
    await host.fail(review.failure)
    return null
  }
  if (isChanged(draft, host.data.form)) {
    host.setData({ formError: copy.rework.demandChanged })
    return null
  }
  if (review.data.warnings.length) {
    host.setData({ reviewExpected: demandContext?.expected ?? [] })
    const confirmed = await host.confirmReview(review.data)
    if (!confirmed || isChanged(draft, host.data.form)) return null
  }
  return review.data.reviewToken
}
