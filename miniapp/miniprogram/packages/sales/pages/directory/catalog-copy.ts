import { contract, copy, type Catalog, type OutputOf } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import { newIdempotencyKey, request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'

interface Host {
  data: {
    customerId: string
    copySourceId: string
    copyBusy: boolean
    canCopy: boolean
    copyPreview: OutputOf<typeof contract.previewCatalogCopy> | null
    side: { id: string; name: string }[]
  }
  idempotencyKey: string
  setData(patch: Record<string, unknown>): void
  show(catalog: Catalog): void
  onPreviewCopy(): Promise<void>
}

export const catalogCopyMethods = {
  onOpenCopy(this: Host) {
    this.idempotencyKey = newIdempotencyKey()
    this.setData({
      copySheet: true,
      copySourceId: '',
      copyPreview: null,
      copyError: '',
      copyOptions: this.data.side
        .filter((customer) => customer.id !== this.data.customerId)
        .map((customer) => ({ id: customer.id, name: customer.name })),
    })
  },
  onCloseCopy(this: Host) {
    this.setData({ copySheet: false })
  },
  onCopySource(this: Host, event: DetailEvent<string>) {
    this.setData({ copySourceId: event.detail, copyPreview: null, copyError: '' })
    void this.onPreviewCopy()
  },
  async onPreviewCopy(this: Host) {
    if (!this.data.copySourceId || this.data.copyBusy) return
    const customerId = this.data.customerId,
      fromCustomerId = this.data.copySourceId
    this.setData({ copyBusy: true, copyPreview: null })
    const result = await request(contract.previewCatalogCopy, {
      params: { customerId },
      query: { fromCustomerId },
    })
    this.setData({ copyBusy: false })
    if (customerId !== this.data.customerId || fromCustomerId !== this.data.copySourceId) return
    if (result.ok)
      this.setData({
        copyPreview: result.data,
        copyError: result.data.copyCount ? '' : copy.rework.noCopyableCatalog,
      })
    else this.setData({ copyError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  async onCopyCatalog(this: Host) {
    const preview = this.data.copyPreview
    if (!preview?.copyCount || this.data.copyBusy || !this.data.canCopy) return
    this.setData({ copyBusy: true, copyError: '' })
    const result = await request(
      contract.copyCatalog,
      {
        params: { customerId: this.data.customerId },
        body: { fromCustomerId: this.data.copySourceId, previewToken: preview.previewToken },
      },
      { idempotencyKey: this.idempotencyKey },
    )
    this.setData({ copyBusy: false })
    if (result.ok) {
      this.show(result.data)
      this.setData({ copySheet: false })
      showSuccess(copy.action.saved)
      return
    }
    const failure = failureOf(result.failure, 'submit')
    if (failure?.kind === 'stale') {
      this.idempotencyKey = newIdempotencyKey()
      await this.onPreviewCopy()
      this.setData({ copyError: copy.rework.catalogChanged })
    } else this.setData({ copyError: failure?.message ?? '' })
  },
}
