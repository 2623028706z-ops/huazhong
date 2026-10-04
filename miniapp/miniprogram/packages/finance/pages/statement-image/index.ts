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
  type DocumentBlock,
  type DocumentImage,
} from '../../../../core/document-image'
import { periodTextOf } from '../../../../views/statement'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
type Share = OutputOf<typeof contract.shareStatement>
const line = (...pairs: [string, string][]) =>
  pairs.map(([label, value]) => `${label} ${value}`).join(f.gap)
function minus(cents: number) {
  return `−${formatMoney(cents)}`
}
const MAIN_TYPES = new Set(['order', 'po', 'wh'])
function tableOf(detail: Share['shareData']): DocumentBlock {
  const supplier = detail.kind === 'supplier'
  return {
    kind: 'table',
    columns: [
      { weight: 4, align: 'left' },
      { weight: 3.3, align: 'left', muted: true },
      { weight: 2.4, align: 'right' },
    ],
    head: [
      `${f.store} · ${f.no}`,
      supplier ? f.receiveDate : f.shipDate,
      supplier ? f.received : f.shipped,
    ],
    rows: detail.groups.flatMap((group) =>
      group.sources
        .filter((source) => MAIN_TYPES.has(source.type))
        .map((source) => [
          group.storeName ? `${group.storeName} ${source.sourceNo}` : source.sourceNo,
          source.sourceDate,
          formatMoney(source.amountCents),
        ]),
    ),
  }
}
function sumsOf(detail: Share['shareData']): DocumentBlock[] {
  const supplier = detail.kind === 'supplier'
  return [
    {
      kind: 'sum',
      label: supplier ? f.received : f.shipped,
      value: formatMoney(supplier ? detail.receivedCents : detail.shippedCents),
    },
    {
      kind: 'sum',
      label: supplier ? f.returned : f.after,
      value: minus(supplier ? detail.returnCents : detail.afterCents),
    },
    {
      kind: 'sum',
      label: supplier ? f.supplierDeducted : f.deducted,
      value: minus(detail.creditDeductedCents),
    },
    ...(detail.openingDebtCents
      ? [
          {
            kind: 'sum' as const,
            label: f.openingDebt,
            value: formatMoney(detail.openingDebtCents),
          },
        ]
      : []),
    {
      kind: 'sum',
      label: supplier ? f.payable : f.receivable,
      value: formatMoney(detail.amountCents),
      strong: true,
    },
    {
      kind: 'sum',
      label: supplier ? f.paid : f.receivedFund,
      value: formatMoney(detail.settledCents),
    },
  ]
}
function imageOf(share: Share): DocumentImage {
  const detail = share.shareData
  return {
    title: f.statement,
    brand: f.company,
    meta: [
      line([detail.kind === 'supplier' ? f.supplier : f.customer, detail.partyName]),
      line([f.no, detail.no], [f.statementDate, detail.statementDate]),
      ...(detail.dueDate ? [line([f.dueDate, detail.dueDate])] : []),
      line([f.period, periodTextOf(detail.periodFrom, detail.periodTo)]),
    ],
    blocks: [
      tableOf(detail),
      { kind: 'rule' },
      ...sumsOf(detail),
      {
        kind: 'note',
        text: line([f.status, f[detail.status]], [f.generatedAt, formatTime(share.generatedAt)]),
      },
    ],
  }
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
    const doc = imageOf(result.data)
    try {
      await new Promise<void>((resolve) => {
        wx.nextTick(resolve)
      })
      const image = await renderDocumentImage(this, doc)
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
