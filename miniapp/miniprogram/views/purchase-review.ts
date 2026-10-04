import { contract, copy, type OutputOf } from '@huazhong/shared'
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
export const purchaseReviewData = {
  reviewSheet: false,
  reviewWarnings: [] as string[],
  reviewInvites: [] as OutputOf<typeof contract.reviewPurchase>['warnings'][number]['invites'],
  reviewDemand: [] as { name: string; summary: string; left: string }[],
  reviewError: '',
}
interface InteractionHost {
  data: { form: PurchaseForm }
  reviewResolve: ((confirmed: boolean) => void) | null
  setData(patch: Record<string, unknown>): void
}
export const purchaseReviewMethods = {
  reviewResolve: null as ((confirmed: boolean) => void) | null,
  confirmReview(this: InteractionHost, review: OutputOf<typeof contract.reviewPurchase>) {
    const invites = new Map(
      review.warnings
        .flatMap((warning) => warning.invites)
        .map((invite) => [invite.inviteId, invite]),
    )
    const demand = review.currentDemand.map((mat) => ({
      name: this.data.form.lines.find((line) => line.id === mat.materialId)?.name ?? '',
      summary: copy.screen.demandNumbers(mat.needQty, mat.stockQty, mat.inTransitQty),
      left: copy.screen.leftQty(mat.leftQty),
    }))
    this.setData({
      reviewSheet: true,
      reviewWarnings: review.warnings.map((warning) => warning.message),
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
    const confirmed = await host.confirmReview(review.data)
    if (!confirmed || isChanged(draft, host.data.form)) return null
  }
  return review.data.reviewToken
}
