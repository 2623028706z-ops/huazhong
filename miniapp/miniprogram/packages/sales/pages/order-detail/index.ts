// X3 订单详情（06 章 X3）：状态区 → 单号、状态、来源 → 客户门店、下单日期、出货日期、备注 → 明细 → 金额 →
// 发货信息 → 变更记录 → 原因行。确认订单弹层选出货日期（默认今天往后 SHIP_DATE_DEFAULT_OFFSET_DAYS 天）；
// 取消按 cancel 的 reasonRequired，弹层开着时被确认返回 STALE，按 latest 换成原因框
import { contract, copy, type OrderDetail } from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk } from '../../../../core/guard'
import { unwatchOnLeave, watchNewer } from '../../../../core/live'
import { request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { orderViewOf } from '../../../../views/order'

const PAGES = '/packages/sales/pages'
const buttonSpecs = [
  { code: 'cancel', secondary: true },
  { code: 'rejectCancel', secondary: true },
  { code: 'voidOrder', secondary: true },
  // 门店申请取消时：拒绝（次）在左、同意（主）在右
  { code: 'approveCancel' },
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
    cancelSheet: false,
    cancelRequired: false,
    cancelError: '',
    texts: {
      cancelTitle: reasonTitles.cancel,
      cancelBody: copy.screen.confirm.cancelOrder,
      confirmCancel: CONFIRM_CANCEL,
    },
  },
  id: '',
  financeScope: false,
  readonlyScope: false,
  order: null as OrderDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.financeScope = query.scope === 'finance'
    this.readonlyScope = query.scope === 'internal'
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
    const result = await request(this.financeScope ? contract.getFinanceOrder : contract.getOrder, {
      params: { id: this.id },
    })
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
      view: orderViewOf(order, false, this.financeScope),
      buttons: this.readonlyScope ? [] : buttonsOf(order.actions, buttonSpecs),
    })
  },
  async onAction(event: CodeEvent) {
    const order = this.order
    if (!order) return
    const { code } = event.currentTarget.dataset
    if (code === 'confirm') {
      void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=confirm&id=${order.id}` })
    } else if (isReasonAction(code)) {
      const cancelRequired = isReasonRequired(order.actions, code)
      const title = reasonTitles[code]
      this.setData({
        cancelSheet: cancelRequired,
        cancelRequired,
        cancelError: '',
        cancelMode: code,
        texts: { ...this.data.texts, cancelTitle: title, confirmCancel: title },
      })
      if (
        !cancelRequired &&
        (await confirmAsk(this, {
          title,
          body: this.data.texts.cancelBody,
          cancel: copy.confirm.cancel,
          confirm: title,
        }))
      )
        await this.submitCancel('')
    } else if (code === 'edit') {
      void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=${code}&id=${order.id}` })
    } else if (code === 'createAfter') {
      void wx.navigateTo({ url: `${PAGES}/after-form/index?orderId=${order.id}` })
    }
  },
  onCloseCancel() {
    this.setData({ cancelSheet: false })
  },
  // 写操作的结果：成功关弹层；STALE 刷新成最新内容，错误写在弹层里
  settle(result: Result<OrderDetail>, done: string): void {
    this.setData({ busy: '' })
    if (result.ok) {
      this.show(result.data)
      this.setData({ cancelSheet: false })
      showSuccess(done)
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    if (view.kind === 'stale') {
      const latest = view.latest as OrderDetail
      this.show(latest)
      const cancelRequired = isReasonRequired(latest.actions, this.data.cancelMode)
      this.setData({ cancelRequired, cancelSheet: cancelRequired })
    }
    const message = messageOf(view)
    this.setData({ cancelError: message, ...(!this.data.cancelSheet ? { failure: view } : {}) })
  },
  async onCancel(event: DetailEvent<string>): Promise<void> {
    await this.submitCancel(event.detail)
  },
  async submitCancel(value: string): Promise<void> {
    const order = this.order
    if (!order || this.data.busy) return
    this.setData({ busy: 'cancel', cancelError: '' })
    const reason = value || undefined
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
    this.settle(result, copy.order.cancelled)
  },
  onFailureAction() {
    void this.load()
  },
})
