import {
  contract,
  copy,
  financeCopy,
  redesignCopy,
  formatTime,
  type ShippingDetail,
} from '@huazhong/shared'
import {
  renderDocumentImage,
  saveDocumentImage,
  shareDocumentImage,
  type DocumentImage,
} from '../../../../core/document-image'
import type { FailureView } from '../../../../core/failure-view'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
const line = (...pairs: [string, string][]) =>
  pairs.map(([label, value]) => `${label} ${value}`).join(financeCopy.gap)
function imageOf(order: ShippingDetail): DocumentImage {
  return {
    title: redesignCopy.delivery,
    brand: financeCopy.company,
    meta: [
      line([redesignCopy.stores, copy.org.store(order.customerName, order.storeName)]),
      line(
        [redesignCopy.contact, `${order.contactName} ${order.contactPhone}`.trim()],
        [redesignCopy.address, order.address || '—'],
      ),
      line(
        [redesignCopy.no, order.no],
        [redesignCopy.shipDate, order.shipDate ?? redesignCopy.waiting],
      ),
      line(
        [redesignCopy.shipper, order.shippedBy ?? '—'],
        [redesignCopy.shippedAt, order.shippedAt ? formatTime(order.shippedAt) : '—'],
      ),
    ],
    blocks: [
      {
        kind: 'table',
        columns: [
          { weight: 6, align: 'left' },
          { weight: 2, align: 'right' },
          { weight: 2, align: 'right' },
        ],
        head: [redesignCopy.product, redesignCopy.actual, redesignCopy.unit],
        rows: [
          ...order.lines.map((item) => [item.name, String(item.shippedQty ?? item.qty), item.unit]),
          { cells: [redesignCopy.totalQty, ...unitTotalsCells(order)], strong: true as const },
        ],
      },
      { kind: 'note', text: `${copy.screen.label.shipNote} ${order.shipNote || '—'}` },
      { kind: 'sign', labels: [redesignCopy.signature, redesignCopy.signedDate] },
    ],
  }
}
function unitTotalsCells(order: ShippingDetail): [string, string] {
  return [
    order.units.map((total) => String(total.qty)).join('\n'),
    order.units.map((total) => total.unit).join('\n'),
  ]
}

Page({
  data: {
    title: redesignCopy.delivery,
    image: '',
    failure: null as FailureView | null,
    busy: false,
    texts: { save: redesignCopy.saveImage, share: redesignCopy.shareImage },
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onReady() {
    void this.load()
  },
  async load() {
    const result = await request(contract.getShippingOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return
    }
    if (result.data.status !== 'shipped') {
      this.setData({
        failure: { kind: 'inline', requestId: null, message: redesignCopy.notShippedYet },
      })
      return
    }
    try {
      this.setData({
        image: await renderDocumentImage(this, imageOf(result.data)),
        failure: null,
      })
    } catch {
      this.setData({
        failure: { kind: 'inline', requestId: null, message: copy.network.loadFailed, retry: true },
      })
    }
  },
  async onSave() {
    if (!this.data.image) return
    try {
      await saveDocumentImage(this.data.image)
    } catch {
      this.setData({
        failure: {
          kind: 'inline',
          requestId: null,
          message: redesignCopy.imageActionFailed,
          retry: false,
        },
      })
    }
  },
  async onShare() {
    if (!this.data.image) return
    try {
      await shareDocumentImage(this.data.image)
    } catch (error) {
      if (String((error as { errMsg?: string }).errMsg).includes('cancel')) return
      this.setData({
        failure: {
          kind: 'inline',
          requestId: null,
          message: redesignCopy.imageActionFailed,
          retry: false,
        },
      })
    }
  },
  onFailureAction() {
    void this.load()
  },
})
