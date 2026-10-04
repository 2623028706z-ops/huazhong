import {
  contract,
  copy,
  redesignCopy,
  formatTime,
  formatUnitTotals,
  type ShippingDetail,
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
function rowsOf(order: ShippingDetail): DocumentImageRow[] {
  return [
    { label: redesignCopy.stores, value: copy.org.store(order.customerName, order.storeName) },
    { label: redesignCopy.contact, value: order.contactName },
    { label: copy.field.storePhone, value: order.contactPhone },
    { label: redesignCopy.address, value: order.address || redesignCopy.notFilled },
    { label: redesignCopy.no, value: order.no },
    { label: redesignCopy.shipDate, value: order.shipDate ?? redesignCopy.waiting },
    { label: redesignCopy.shipper, value: order.shippedBy ?? '' },
    { label: redesignCopy.shippedAt, value: order.shippedAt ? formatTime(order.shippedAt) : '' },
    '',
    { label: redesignCopy.productLines, value: `${redesignCopy.actual} / ${redesignCopy.unit}` },
    ...order.lines.map((line) => ({
      label: line.name,
      value: `${line.shippedQty ?? line.qty} ${line.unit}`,
    })),
    { label: redesignCopy.totalQty, value: formatUnitTotals(order.units) },
    { label: copy.screen.label.shipNote, value: order.shipNote ?? '' },
    '',
    { label: redesignCopy.signature, value: '__________________' },
    { label: redesignCopy.signedDate, value: '__________________' },
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
    if (result.data.status !== 'shipped') return
    try {
      this.setData({
        image: await renderDocumentImage(this, rowsOf(result.data), redesignCopy.delivery),
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
