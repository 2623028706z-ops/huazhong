// S6 订单详情（06 章 S6）：状态区 → 单号、状态、下单日期、出货日期、备注 → 明细 → 金额 → 发货备注 → 变更记录 → 原因行。
// 底部「取消订单」（storeCancel）、「修改订单」（storeEdit）、「申请售后」（applyAfter），禁用时写 disabledReason。
// 打开时取消申请结果还没看过的，记门店已看过
import { contract, copy, type OrderDetail } from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watchNewer, pullToRefresh } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { orderViewOf } from '../../../../views/order'
import { startEdit } from '../../cart-source'

const buttonSpecs = [
  { code: 'storeCancel', secondary: true },
  { code: 'requestCancel', secondary: true },
  { code: 'withdrawCancel', secondary: true },
  { code: 'storeEdit' },
  { code: 'applyAfter' },
] as const
type CancelCode = 'storeCancel' | 'requestCancel' | 'withdrawCancel'
const cancelTitles: Record<CancelCode, string> = {
  storeCancel: copy.screen.action.storeCancel,
  requestCancel: copy.rework.requestCancel,
  withdrawCancel: copy.rework.withdrawCancel,
}
const cancelConfirms: Record<CancelCode, string> = {
  storeCancel: copy.screen.action.confirmCancel,
  requestCancel: copy.rework.submitCancelRequest,
  withdrawCancel: copy.rework.confirmWithdrawCancel,
}
const sheetDefaults = { cancelMode: 'storeCancel' as CancelCode }
function isCancelAction(code: string): code is CancelCode {
  return Object.prototype.hasOwnProperty.call(cancelTitles, code)
}

Page({
  ...pullToRefresh,
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
    ...sheetDefaults,
    texts: {
      cancelTitle: cancelTitles.storeCancel,
      cancelBody: copy.screen.confirm.cancelOrder,
      confirmCancel: cancelConfirms.storeCancel,
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
    // 有没看过的取消申请结果：点开就记看过（03 章第 8.1 节），回到订单页角标、小红点跟着消
    if (result.data.unseen) void request(contract.markStoreOrderSeen, { params: { id: this.id } })
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
    if (isCancelAction(code)) {
      const required = isReasonRequired(order.actions, code)
      this.setData({
        sheet: true,
        sheetRequired: required,
        sheetError: '',
        cancelMode: code,
        texts: {
          ...this.data.texts,
          cancelTitle: cancelTitles[code],
          confirmCancel: cancelConfirms[code],
        },
      })
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
  async onCancel(event: DetailEvent<string>): Promise<void> {
    const order = this.order
    if (!order) return
    this.setData({ busy: 'storeCancel', sheetError: '' })
    const endpoint =
      this.data.cancelMode === 'requestCancel'
        ? contract.requestOrderCancel
        : this.data.cancelMode === 'withdrawCancel'
          ? contract.withdrawOrderCancel
          : contract.cancelStoreOrder
    const result = await request(endpoint, {
      params: { id: order.id },
      body: { version: order.version, reason: event.detail },
    })
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData({ sheet: false })
      showSuccess(this.data.cancelMode === 'storeCancel' ? copy.order.cancelled : copy.action.saved)
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
