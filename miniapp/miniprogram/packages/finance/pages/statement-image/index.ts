import {
  contract,
  financeCopy as f,
  financeTexts,
  formatMoney,
  formatTime,
  type OutputOf,
} from '@huazhong/shared'
import {
  renderDocumentImage,
  saveDocumentImage,
  shareDocumentImage,
  type DocumentImageRow,
} from '../../../../core/document-image'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
type Share = OutputOf<typeof contract.shareStatement>
function imageAmountsOf(detail: Share['shareData']): DocumentImageRow[] {
  const supplier = detail.kind === 'supplier'
  return [
    {
      label: supplier ? f.received : f.shipped,
      value: formatMoney(supplier ? detail.receivedCents : detail.shippedCents),
    },
    {
      label: supplier ? f.returned : f.after,
      value: formatMoney(supplier ? detail.returnCents : detail.afterCents),
    },
    {
      label: supplier ? f.supplierDeducted : f.deducted,
      value: formatMoney(detail.creditDeductedCents),
    },
    ...(detail.openingDebtCents
      ? [{ label: f.openingDebt, value: formatMoney(detail.openingDebtCents) }]
      : []),
    { label: supplier ? f.payable : f.receivable, value: formatMoney(detail.amountCents) },
    { label: supplier ? f.paid : f.receivedFund, value: formatMoney(detail.settledCents) },
  ]
}
function imageRowsOf(share: Share): DocumentImageRow[] {
  const detail = share.shareData
  const rows: DocumentImageRow[] = [
    { label: detail.kind === 'supplier' ? f.supplier : f.customer, value: detail.partyName },
    { label: f.no, value: detail.no },
    { label: f.statementDate, value: detail.statementDate },
    { label: f.period, value: `${detail.periodFrom} — ${detail.periodTo}` },
    ...(detail.dueDate ? [{ label: f.dueDate, value: detail.dueDate }] : []),
  ]
  for (const group of detail.groups) {
    rows.push(group.storeName ?? detail.partyName)
    for (const source of group.sources) {
      const dates = {
        order: f.shipDate,
        after: f.afterDate,
        po: f.receiveDate,
        wh: f.stockInDate,
        purchase_return: f.afterDate,
        price_change: f.afterDate,
      }
      rows.push(
        { label: f.no, value: source.sourceNo },
        { label: dates[source.type], value: source.sourceDate },
        { label: f.amount, value: formatMoney(source.amountCents) },
        '',
      )
    }
  }
  return [
    ...rows,
    ...imageAmountsOf(detail),
    { label: f.status, value: f[detail.status] },
    { label: f.generatedAt, value: formatTime(share.generatedAt) },
  ]
}
Page({
  data: {
    title: f.statementShare,
    image: '',
    busy: false,
    error: '',
    failure: null as FailureView | null,
    texts: financeTexts,
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    void this.load()
  },
  async load() {
    this.setData({ busy: true, error: '' })
    const result = await request(contract.shareStatement, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ busy: false, failure: failureOf(result.failure, 'load') })
      return
    }
    const rows = imageRowsOf(result.data)
    try {
      await new Promise<void>((resolve) => {
        wx.nextTick(resolve)
      })
      const image = await renderDocumentImage(this, rows, f.statement)
      this.setData({ image, busy: false, failure: null })
    } catch {
      this.setData({ busy: false, error: f.imageGenerateFailed })
    }
  },
  onFailureAction() {
    void this.load()
  },
  async imageOperation(action: 'save' | 'send') {
    if (!this.data.image) return
    this.setData({ error: '' })
    try {
      if (action === 'save') await saveDocumentImage(this.data.image)
      else await shareDocumentImage(this.data.image)
    } catch (error) {
      if (!isCanceled(error))
        this.setData({ error: action === 'save' ? f.imageSaveFailed : f.imageShareFailed })
    }
  },
  async onSave() {
    await this.imageOperation('save')
  },
  async onSend() {
    await this.imageOperation('send')
  },
})
function isCanceled(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errMsg' in error &&
    typeof error.errMsg === 'string' &&
    /cancel/i.test(error.errMsg)
  )
}
