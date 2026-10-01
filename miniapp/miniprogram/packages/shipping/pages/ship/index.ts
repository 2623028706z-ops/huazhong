// H3 发货（06 章 H3）：actions 含 ship 时是表单：状态区 → 客户门店、出货日期、备注 → 明细（订单数量、实发，
// 默认等于订单数量）→ 发货金额 → 发货备注 → 变更记录。出货日期还没到时按钮禁用、写 disabledReason，实发和备注不能填。
// 否则只读。确认后回进来的列表
import {
  contract,
  copy,
  formatMoney,
  orderShipSchema,
  fieldsOf,
  type OrderDetail,
} from '@huazhong/shared'
import { canDo, findAction } from '../../../../core/actions'
import type { DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { markChanged, syncUnloadAlert } from '../../../../core/guard'
import { unwatch, watchNewer } from '../../../../core/live'
import { lineCents, sumCents } from '../../../../core/money'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { orderViewOf, rowsOf, shipDateText } from '../../../../views/order'

interface ShipLine {
  id: string
  name: string
  unit: string
  qty: number
  shippedQty: number
  priceCents: number
}

function shipLinesOf(order: OrderDetail): ShipLine[] {
  return order.lines.map((line) => ({
    id: line.id,
    name: line.name,
    unit: line.unit,
    qty: line.qty,
    shippedQty: line.qty,
    priceCents: line.priceCents,
  }))
}

// 实发少于订单数量标「少发」；金额按实发预览
function lineViewsOf(lines: readonly ShipLine[]) {
  return lines.map((line) => ({
    key: line.id,
    name: line.name,
    tags:
      line.shippedQty < line.qty
        ? [{ text: copy.screen.tag.short, warn: true }]
        : [{ text: `${copy.screen.label.orderQty} ${line.qty}`, warn: false }],
    amountCents: lineCents(line.shippedQty, line.priceCents),
    qty: line.shippedQty,
    unit: line.unit,
    priceCents: line.priceCents,
    priceText: '',
  }))
}

function infoOf(order: OrderDetail) {
  return {
    title: order.no,
    statusKind: 'orderStatus',
    status: order.status,
    rows: rowsOf([
      [copy.screen.label.customerStore, copy.org.store(order.customerName, order.storeName)],
      [copy.field.shipDate, shipDateText(order.shipDate)],
      [copy.field.note, order.note],
    ]),
  }
}

Page({
  data: {
    changed: false,
    title: copy.screen.title.ship,
    loaded: false,
    failure: null as FailureView | null,
    formError: '',
    realtime: '',
    isForm: false,
    canShip: false,
    shipReason: '',
    info: null as ReturnType<typeof infoOf> | null,
    view: null as ReturnType<typeof orderViewOf> | null,
    lines: [] as ShipLine[],
    lineViews: [] as ReturnType<typeof lineViewsOf>,
    amountRows: [] as { label: string; value: string }[],
    shipNote: '',
    saving: false,
    texts: {
      shipNote: copy.screen.label.shipNote,
      optional: copy.placeholder.optional,
      ship: copy.screen.action.ship,
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
    const result = await request(contract.getOrder, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.show(result.data)
  },
  show(order: OrderDetail) {
    this.order = order
    const action = findAction(order.actions, 'ship')
    this.setData({
      loaded: true,
      failure: null,
      realtime: '',
      isForm: action !== null,
      canShip: canDo(order.actions, 'ship'),
      shipReason: action?.disabledReason ?? '',
      info: infoOf(order),
      view: orderViewOf(order, false),
      shipNote: '',
    })
    this.setLines(shipLinesOf(order), false)
  },
  setLines(lines: ShipLine[], changed = true) {
    const total = sumCents(lines, (line) => lineCents(line.shippedQty, line.priceCents))
    this.setData({
      lines,
      lineViews: lineViewsOf(lines),
      amountRows: [{ label: copy.screen.label.shipAmount, value: formatMoney(total) }],
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
  onNote(event: DetailEvent<string>) {
    this.setData({ shipNote: event.detail, formError: '' })
    markChanged(this, true)
  },
  onRealtime() {
    void this.load()
  },
  async onShip(): Promise<void> {
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
      markChanged(this, false)
      showSuccess(copy.order.shipped)
      void wx.navigateBack()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (view?.kind === 'stale') {
      this.show(view.latest as OrderDetail)
      this.setData({ formError: view.message })
    } else if (view?.kind === 'page') this.setData({ failure: view })
    else if (view) this.setData({ formError: view.message })
  },
  onFailureAction() {
    void this.load()
  },
})
