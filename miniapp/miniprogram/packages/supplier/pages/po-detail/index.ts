import { contract, copy, type SupplierPoDetail } from '@huazhong/shared'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { canDo } from '../../../../core/actions'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { watch, unwatchOnLeave, pullToRefresh } from '../../../../core/live'
import { poViewOf } from '../../../../views/purchase'
Page({
  ...pullToRefresh,
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.purchaseOrder,
    loaded: false,
    failure: null as FailureView | null,
    view: null as ReturnType<typeof poViewOf> | null,
    canCancel: false,
    canEdit: false,
    cancelSheet: false,
    busy: false,
    error: '',
    cancelText: copy.screen.action.cancelPo,
    editText: copy.screen.title.editPo,
    confirmCancel: copy.screen.action.confirmCancel,
  },
  id: '',
  po: null as SupplierPoDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
    watch(this, [`po:${this.id}`], () => void this.load())
  },
  async load() {
    const result = await request(contract.supplierPurchaseOrder, { params: { id: this.id } })
    if (result.ok) {
      this.po = result.data
      this.setData({
        loaded: true,
        failure: null,
        view: poViewOf(result.data, true),
        canCancel: canDo(result.data.actions, 'supplierCancelPo'),
        canEdit: canDo(result.data.actions, 'supplierEditPo'),
      })
    } else
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
  },
  onFailureAction() {
    void this.load()
  },
  onCancel() {
    this.setData({ cancelSheet: true, error: '' })
  },
  onCloseCancel() {
    this.setData({ cancelSheet: false })
  },
  onEdit() {
    void wx.navigateTo({ url: `/packages/supplier/pages/supply/index?poId=${this.id}` })
  },
  async onSubmitCancel(event: DetailEvent<string>) {
    if (!this.po || this.data.busy) return
    this.setData({ busy: true, error: '' })
    const result = await request(contract.supplierCancelPurchaseOrder, {
      params: { id: this.id },
      body: { version: this.po.version, reason: event.detail },
    })
    this.setData({ busy: false })
    if (result.ok) {
      this.setData({ cancelSheet: false })
      await this.load()
    } else {
      const fail = failureOf(result.failure, 'submit')
      this.setData({ error: fail?.message ?? '' })
      if (fail?.kind === 'stale') await this.load()
    }
  },
})
