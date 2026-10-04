// H3 发货（06 章 H3）：actions 含 ship 时是表单：状态区 → 客户门店、出货日期、备注 → 明细（订单数量、实发，
// 默认等于订单数量）→ 合计数量 → 发货备注 → 变更记录。出货日期还没到时按钮禁用、写 disabledReason，实发和备注不能填。
// 否则只读。确认后回进来的列表
import {
  contract,
  copy,
  redesignCopy,
  orderShipSchema,
  fieldsOf,
  type ShippingDetail,
} from '@huazhong/shared'
import { loadPicking, savePicking, clearPicking } from '../../../../core/picking'
import { canDo, findAction } from '../../../../core/actions'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watchNewer } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { shippingViewOf, shippingInfoOf } from '../../../../views/order'

interface ShipLine {
  id: string
  name: string
  code: string
  unit: string
  qty: number
  shippedQty: number
  packed: boolean
}

function shipLinesOf(order: ShippingDetail): ShipLine[] {
  return order.lines.map((line) => ({
    id: line.id,
    name: line.name,
    code: line.customerCode,
    unit: line.unit,
    qty: line.qty,
    shippedQty: line.qty,
    packed: loadPicking(order.id).includes(line.id),
  }))
}

// 实发少于订单数量标「少发」；只预览数量
function lineViewsOf(lines: readonly ShipLine[]) {
  return lines.map((line) => ({
    key: line.id,
    name: line.name,
    code: line.code,
    tags:
      line.shippedQty < line.qty
        ? [{ text: copy.screen.tag.short, warn: true }]
        : line.shippedQty > line.qty
          ? [{ text: copy.rework.overShipped, warn: true }]
          : [],
    qty: line.shippedQty,
    orderedQty: line.qty,
    packed: line.packed,
    unit: line.unit,
  }))
}

const infoOf = shippingInfoOf

Page({
  data: {
    changed: false,
    title: copy.screen.title.shipDetail,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    realtime: '',
    orderNote: '',
    isForm: false,
    canShip: false,
    shipReason: '',
    info: null as ReturnType<typeof infoOf> | null,
    view: null as ReturnType<typeof shippingViewOf> | null,
    lines: [] as ShipLine[],
    lineViews: [] as ReturnType<typeof lineViewsOf>,
    shipNote: '',
    saving: false,
    texts: {
      contact: redesignCopy.contact,
      address: redesignCopy.address,
      lines: copy.screen.section.lines,
      shipNote: copy.screen.label.shipNote,
      optional: copy.placeholder.optional,
      ship: copy.screen.action.ship,
      delivery: redesignCopy.delivery,
    },
  },
  id: '',
  order: null as ShippingDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    if (!this.data.changed) void this.load()
    watchNewer(
      this,
      `order:${this.id}`,
      () => this.order?.version,
      () => {
        this.setData({ realtime: copy.screen.realtime.editing })
      },
    )
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
    syncUnloadAlert(false)
  },
  async load(): Promise<void> {
    const result = await request(contract.getShippingOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.applyLatest(result.data)
  },
  applyLatest(order: ShippingDetail) {
    const changed = this.data.changed,
      lines = this.data.lines,
      note = this.data.shipNote
    this.show(order)
    if (changed && canDo(order.actions, 'ship')) {
      const quantities = new Map(lines.map((line) => [line.id, line.shippedQty]))
      this.setLines(
        shipLinesOf(order).map((line) => ({
          ...line,
          shippedQty: quantities.get(line.id) ?? line.shippedQty,
        })),
      )
      this.setData({ shipNote: note, realtime: copy.screen.realtime.editing })
    }
  },
  show(order: ShippingDetail) {
    this.order = order
    if (order.status === 'shipped') clearPicking(order.id)
    const action = findAction(order.actions, 'ship')
    this.setData({
      loaded: true,
      failure: null,
      realtime: '',
      isForm: action !== null,
      canShip: canDo(order.actions, 'ship'),
      shipReason: action?.disabledReason ?? '',
      info: infoOf(order),
      view: shippingViewOf(order),
      orderNote: order.note ? redesignCopy.orderNote(order.note) : '',
      shipNote: '',
    })
    this.setLines(shipLinesOf(order), false)
  },
  setLines(lines: ShipLine[], changed = true) {
    this.setData({
      lines,
      lineViews: lineViewsOf(lines),
      formError: '',
    })
    markChanged(this, changed)
  },
  onQty(event: DetailEvent<{ index: number; qty: number }>) {
    const { index, qty } = event.detail
    this.setLines(
      this.data.lines.map((line, i) => (i === index ? { ...line, shippedQty: qty } : line)),
    )
  },
  onPacked(event: DetailEvent<number>) {
    const lines = this.data.lines.map((line, index) =>
      index === event.detail ? { ...line, packed: !line.packed } : line,
    )
    savePicking(
      this.id,
      lines.filter((line) => line.packed).map((line) => line.id),
    )
    this.setData({ lines, lineViews: lineViewsOf(lines) })
  },
  onDelivery() {
    void wx.navigateTo({ url: `/packages/shipping/pages/delivery/index?id=${this.id}` })
  },
  onNote(event: DetailEvent<string>) {
    this.setData({ shipNote: event.detail, formError: '' })
    markChanged(this, true)
  },
  onRealtime() {
    void this.load()
  },
  async onShip(): Promise<void> {
    if (this.data.saving) return
    const order = this.order
    if (!order) return
    const lines = this.data.lines.map((line) => ({
      orderLineId: line.id,
      shippedQty: line.shippedQty,
    }))
    const parsed = orderShipSchema.safeParse({
      version: order.version,
      shipNote: this.data.shipNote,
      lines,
    })
    if (!parsed.success) {
      this.setData({ formError: Object.values(fieldsOf(parsed.error))[0] ?? '' })
      return
    }
    this.setData({ saving: true, formError: '' })
    const result = await request(contract.shipOrder, {
      params: { id: order.id },
      body: parsed.data,
    })
    this.setData({ saving: false })
    if (result.ok) {
      clearPicking(order.id)
      markChanged(this, false)
      showSuccess(copy.order.shipped)
      void wx.navigateBack()
      return
    }
    this.showShipFailure(result.failure)
  },
  showShipFailure(failure: Parameters<typeof failureOf>[0]) {
    const view = failureOf(failure, 'submit')
    if (view?.kind === 'stale') {
      this.applyLatest(view.latest as ShippingDetail)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
