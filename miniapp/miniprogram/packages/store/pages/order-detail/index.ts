// S6 订单详情（06 章 S6）：状态区 → 单号、状态、下单日期、出货日期、备注 → 明细 → 金额 → 发货备注 → 变更记录 → 原因行。
// 底部「取消订单」（storeCancel）、「修改订单」（storeEdit）、「申请售后」（applyAfter），禁用时写 disabledReason
import { contract, copy, type OrderDetail } from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watchNewer } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { orderViewOf } from '../../../../views/order'
import { startEdit } from '../../cart-source'

const buttonSpecs = [
  { code: 'storeCancel', secondary: true },
  { code: 'storeEdit' },
  { code: 'applyAfter' },
] as const

Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.orderDetail,
    loaded: false,
    failure: null as FailureView | null,
    realtime: '',
    view: null as ReturnType<typeof orderViewOf> | null,
    buttons: [] as ButtonView[],
    busy: '',
    sheet: false,
    sheetRequired: false,
    sheetError: '',
    texts: {
      cancelTitle: copy.screen.action.storeCancel,
      cancelBody: copy.screen.confirm.cancelOrder,
      confirmCancel: copy.screen.action.confirmCancel,
    },
  },
  id: '',
  order: null as OrderDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
    watchNewer(
      this,
      `order:${this.id}`,
      () => this.order?.version,
      () => void this.load(true),
    )
  },
  async load(pushed = false) {
    const result = await request(contract.getOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.show(result.data)
    if (pushed) this.setData({ realtime: copy.screen.realtime.refreshed })
  },
  show(order: OrderDetail) {
    this.order = order
    this.setData({
      loaded: true,
      failure: null,
      view: orderViewOf(order, true),
      buttons: buttonsOf(order.actions, buttonSpecs),
    })
  },
  onAction(event: CodeEvent) {
    const order = this.order
    if (!order) return
    const { code } = event.currentTarget.dataset
    if (code === 'storeCancel') {
      const required = isReasonRequired(order.actions, 'storeCancel')
      this.setData({ sheet: true, sheetRequired: required, sheetError: '' })
    } else if (code === 'storeEdit') {
      startEdit(order)
      void wx.navigateTo({ url: '/packages/store/pages/shop/index?mode=edit' })
    } else if (code === 'applyAfter') {
      void wx.navigateTo({ url: `/packages/store/pages/after-form/index?orderId=${order.id}` })
    }
  },
  onCloseSheet() {
    this.setData({ sheet: false })
  },
  async onCancel(): Promise<void> {
    const order = this.order
    if (!order) return
    this.setData({ busy: 'storeCancel', sheetError: '' })
    const result = await request(contract.cancelStoreOrder, {
      params: { id: order.id },
      body: { version: order.version },
    })
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData({ sheet: false })
      showSuccess(copy.order.cancelled)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') this.show(view.latest as OrderDetail)
    if (view) this.setData({ sheetError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
