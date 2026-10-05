// X3 订单详情（06 章 X3）：状态区 → 单号、状态、来源 → 客户门店、下单日期、出货日期、备注 → 明细 → 金额 →
// 发货信息 → 变更记录 → 原因行。「确认」弹层（hz-order-confirm，和 X2 批量确认共用）只选出货日期，确认后留在详情；
// 要改数量、单价的走底部灰字「修改后确认」进 X4 确认模式；
// 取消按 cancel 的 reasonRequired，弹层开着时被确认返回 STALE，按 latest 换成原因框
import { contract, copy, formatMoney, redesignCopy, type OrderDetail } from '@huazhong/shared'
import { buttonsOf, isReasonRequired, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { confirmAsk } from '../../../../core/guard'
import { unwatchOnLeave, watchNewer, pullToRefresh } from '../../../../core/live'
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
const INITIAL_BODY: string = redesignCopy.orderAction.cancel.body
const sheetDefaults = { cancelMode: 'cancel' as ReasonCode }
// 「客户 · 门店 · 单号」：弹层和确认框先写是哪一单
const subjectOf = (order: OrderDetail): string =>
  copy.org.store(copy.org.store(order.customerName, order.storeName), order.no)
const CONFIRM_CANCEL: string = copy.screen.action.confirmCancel
const confirmTexts: Record<ReasonCode, string> = {
  cancel: CONFIRM_CANCEL,
  approveCancel: copy.rework.approveCancel,
  rejectCancel: copy.rework.rejectCancel,
  voidOrder: copy.screen.action.confirmVoid,
}
const subjectOfCustomer = (order: OrderDetail): string =>
  copy.org.store(order.customerName, order.storeName)
// 「确认」旁边多一个底部灰字「修改后确认」：要改数量、单价时进 X4 确认模式；可用状态和「确认」一致
function buttonsWithEdit(buttons: ButtonView[]): ButtonView[] {
  const confirm = buttons.find((button) => button.code === 'confirm')
  if (!confirm) return buttons
  return [
    ...buttons,
    { ...confirm, code: 'confirmEdit', text: redesignCopy.confirmWithEdit, kind: 'text' },
  ]
}
function isReasonAction(code: string): code is ReasonCode {
  return Object.prototype.hasOwnProperty.call(reasonTitles, code)
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
    ...sheetDefaults,
    confirmSheet: false,
    confirmTargets: [] as { id: string; version: number; no: string; title: string }[],
    confirmOverdue: [] as string[],
    cancelSheet: false,
    cancelRequired: false,
    cancelOptional: false,
    cancelError: '',
    bomSheet: false,
    bom: { title: '', hint: '', rows: [] as { key: string; name: string; qty: string }[] },
    texts: {
      shippedBom: copy.screen.title.shippedBom,
      shippedHint: copy.screen.catalog.shippedHint,
      cancelTitle: reasonTitles.cancel,
      cancelBody: INITIAL_BODY,
      cancelSubject: '',
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
      buttons: this.readonlyScope ? [] : buttonsWithEdit(buttonsOf(order.actions, buttonSpecs)),
    })
  },
  // 已发货的行：看发货时存下的配方（每单位用量，不乘数量）
  onOpenBom(event: DetailEvent<number>) {
    const line = this.order?.lines[event.detail]
    if (!line?.bom?.length) return
    this.setData({
      bomSheet: true,
      bom: {
        title: line.name,
        hint: copy.screen.catalog.bomHint(line.unit, line.bom.length),
        rows: line.bom.map((row, index) => ({
          key: String(index),
          name: row.materialName,
          qty: `${row.qty} ${row.unit}`,
        })),
      },
    })
  },
  onCloseBom() {
    this.setData({ bomSheet: false })
  },
  async onAction(event: CodeEvent) {
    const order = this.order
    if (!order) return
    const { code } = event.currentTarget.dataset
    if (code === 'confirm') {
      this.openConfirm(order)
    } else if (code === 'confirmEdit') {
      void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=confirm&id=${order.id}` })
    } else if (isReasonAction(code)) {
      await this.openReason(order, code)
    } else if (code === 'edit') {
      void wx.navigateTo({ url: `${PAGES}/order-form/index?mode=${code}&id=${order.id}` })
    } else if (code === 'createAfter') {
      void wx.navigateTo({ url: `${PAGES}/after-form/index?orderId=${order.id}` })
    }
  },
  async openReason(order: OrderDetail, code: ReasonCode): Promise<void> {
    const cancelRequired = isReasonRequired(order.actions, code)
    // 拒绝取消申请：原因选填，也要弹原因框
    const optional = code === 'rejectCancel'
    const title = reasonTitles[code]
    this.setData({
      cancelSheet: cancelRequired || optional,
      cancelRequired,
      cancelOptional: optional,
      cancelError: '',
      cancelMode: code,
      texts: {
        ...this.data.texts,
        cancelTitle: title,
        confirmCancel: confirmTexts[code],
        cancelBody: redesignCopy.orderAction[code].body,
        cancelSubject: subjectOf(order),
      },
    })
    if (
      !cancelRequired &&
      !optional &&
      (await confirmAsk(this, {
        title,
        body: `${subjectOf(order)}\n${redesignCopy.orderAction[code].body}`,
        cancel: copy.confirm.cancel,
        confirm: confirmTexts[code],
      }))
    )
      await this.submitCancel('')
  },
  // 确认订单弹层：只放出货日期，欠款黄条只提醒
  openConfirm(order: OrderDetail) {
    this.setData({
      confirmSheet: true,
      confirmTargets: [
        { id: order.id, version: order.version, no: order.no, title: subjectOfCustomer(order) },
      ],
      confirmOverdue: order.overdue
        ? [
            redesignCopy.overdueNotice(
              order.customerName,
              formatMoney(order.overdue.amountCents),
              order.overdue.days,
            ),
          ]
        : [],
    })
  },
  onCloseConfirm() {
    this.setData({ confirmSheet: false })
  },
  // 弹层里确认完：留在详情，刷新成最新状态
  async onConfirmDone(event: DetailEvent<{ message: string }>) {
    this.setData({ confirmSheet: false })
    await this.load()
    void wx.showToast({ title: event.detail.message, icon: 'none' })
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
      const optional = this.data.cancelMode === 'rejectCancel'
      this.setData({ cancelRequired, cancelSheet: cancelRequired || optional })
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
    this.settle(result, redesignCopy.orderAction[this.data.cancelMode].done)
  },
  onFailureAction() {
    void this.load()
  },
})
