// X3 订单详情（06 章 X3）：状态区 → 单号、状态、来源 → 客户门店、下单日期、出货日期、备注 → 明细 → 金额 →
// 发货信息 → 变更记录 → 原因行。确认订单弹层选出货日期（默认今天往后 SHIP_DATE_DEFAULT_OFFSET_DAYS 天）；
// 取消按 cancel 的 reasonRequired，弹层开着时被确认返回 STALE，按 latest 换成原因框
import {
  SHIP_DATE_DEFAULT_OFFSET_DAYS,
  addDays,
  contract,
  copy,
  shanghaiDateOf,
  type OrderDetail,
} from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watchNewer } from '../../../../core/live'
import { request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { orderViewOf } from '../../../../views/order'

const PAGES = '/packages/sales/pages'
const buttonSpecs = [
  { code: 'cancel', secondary: true },
  { code: 'approveCancel', secondary: true },
  { code: 'rejectCancel', secondary: true },
  { code: 'voidOrder', secondary: true },
  { code: 'editAndConfirm', secondary: true },
  { code: 'confirm' },
  { code: 'edit' },
  { code: 'createAfter' },
] as const
type ReasonCode = 'cancel' | 'approveCancel' | 'rejectCancel' | 'voidOrder'
const reasonTitles: Record<ReasonCode, string> = {
  cancel: copy.screen.action.cancel,
  approveCancel: copy.rework.approveCancel,
  rejectCancel: copy.rework.rejectCancel,
  voidOrder: copy.rework.voidOrder,
}
const sheetDefaults = { cancelMode: 'cancel' as ReasonCode }
const CONFIRM_CANCEL: string = copy.screen.action.confirmCancel
function isReasonAction(code: string): code is ReasonCode {
  return Object.hasOwn(reasonTitles, code)
}

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
    ...sheetDefaults,
    confirmSheet: false,
    shipDate: '',
    confirmError: '',
    cancelSheet: false,
    cancelRequired: false,
    cancelError: '',
    texts: {
      confirmTitle: copy.screen.title.confirmOrder,
      confirm: copy.screen.action.confirm,
      shipDate: copy.field.shipDate,
      cancelTitle: reasonTitles.cancel,
      cancelBody: copy.screen.confirm.cancelOrder,
      confirmCancel: CONFIRM_CANCEL,
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
      view: orderViewOf(order, false),
      buttons: buttonsOf(order.actions, buttonSpecs),
    })
  },
  onAction(event: CodeEvent) {
    const order = this.order
    if (!order) return
    const { code } = event.currentTarget.dataset
    if (code === 'confirm') {
      const shipDate = addDays(shanghaiDateOf(Date.now()), SHIP_DATE_DEFAULT_OFFSET_DAYS)
      this.setData({ confirmSheet: true, shipDate, confirmError: '' })
    } else if (isReasonAction(code)) {
      const cancelRequired = isReasonRequired(order.actions, code)
      const title = reasonTitles[code]
      this.setData({
        cancelSheet: true,
        cancelRequired,
        cancelError: '',
        cancelMode: code,
        texts: { ...this.data.texts, cancelTitle: title, confirmCancel: title },
      })
    } else if (code === 'edit' || code === 'editAndConfirm') {
      void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=${code}&id=${order.id}` })
    } else if (code === 'createAfter') {
      void wx.navigateTo({ url: `${PAGES}/after-form/index?orderId=${order.id}` })
    }
  },
  onShipDate(event: DetailEvent<string>) {
    this.setData({ shipDate: event.detail, confirmError: '' })
  },
  onCloseConfirm() {
    this.setData({ confirmSheet: false })
  },
  onCloseCancel() {
    this.setData({ cancelSheet: false })
  },
  // 写操作的结果：成功关弹层；STALE 刷新成最新内容，错误写在弹层里
  settle(result: Result<OrderDetail>, sheet: 'confirm' | 'cancel', done: string): void {
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData(sheet === 'confirm' ? { confirmSheet: false } : { cancelSheet: false })
      showSuccess(done)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') {
      const latest = view.latest as OrderDetail
      this.show(latest)
      this.setData({ cancelRequired: isReasonRequired(latest.actions, this.data.cancelMode) })
    }
    const errorKey = sheet === 'confirm' ? 'confirmError' : 'cancelError'
    const message = messageOf(view)
    this.setData({ [errorKey]: message })
  },
  async onConfirm(): Promise<void> {
    const order = this.order
    if (!order) return
    this.setData({ busy: 'confirm', confirmError: '' })
    const body = { version: order.version, shipDate: this.data.shipDate }
    const result = await request(contract.confirmOrder, { params: { id: order.id }, body })
    this.settle(result, 'confirm', copy.order.confirmed)
  },
  async onCancel(event: DetailEvent<string>): Promise<void> {
    const order = this.order
    if (!order) return
    this.setData({ busy: 'cancel', cancelError: '' })
    const reason = event.detail || undefined
    const body = { version: order.version, reason }
    const endpoint =
      this.data.cancelMode === 'approveCancel'
        ? contract.approveOrderCancel
        : this.data.cancelMode === 'rejectCancel'
          ? contract.rejectOrderCancel
          : this.data.cancelMode === 'voidOrder'
            ? contract.voidOrder
            : contract.cancelOrder
    const result = await request(endpoint, {
      params: { id: order.id },
      body: { ...body, reason: reason ?? '' },
    })
    this.settle(result, 'cancel', copy.order.cancelled)
  },
  onFailureAction() {
    void this.load()
  },
})
