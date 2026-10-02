// F3 客户对账详情（06 章 F3）：筛选收款状态、出货日期（默认全部）→ 对账格 → 发货单三行卡片。
// 底部「核销预收」（allocate，次）、「登记收款」（registerReceipt）→ F4。
// 同一个弹层里切换：发货单 → 售后详情（作废售后）/ 收款详情（作废收款），左上角返回上一层
import { contract, copy, payStatuses, type ArCard, type PayStatus } from '@huazhong/shared'
import { buttonsOf, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request, type Result } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { arRowOf } from '../../../../views/ar'
import { listHandlers, listOf, listQueryOf } from '../../../../views/list'
import {
  PaymentPanel,
  paymentPanelData,
  paymentPanelHandlers,
} from '../../../../views/payment-panel'
import { watch } from '../../../../core/live'
import { afterSheetOf, cellsOf, orderSheetOf } from './view'
import { textOfCents } from '../../../../core/money'
import { labels } from '@huazhong/shared'

type Layer = 'order' | 'after'

// 标成 string：取到客户名后换成客户名
const DEFAULT_TITLE: string = copy.screen.title.arCustomer
const buttonSpecs = [{ code: 'allocate', secondary: true }, { code: 'registerReceipt' }] as const
const layerTitles: Record<Layer, string> = {
  order: copy.screen.label.shipAmount,
  after: copy.screen.title.afterDetail,
}

Page({
  ...listHandlers,
  ...paymentPanelHandlers,
  data: {
    ...paymentPanelData,
    title: DEFAULT_TITLE,
    statusKind: 'payStatus',
    statuses: [...payStatuses],
    counts: {},
    dateLabel: copy.field.shipDate,
    filter: emptyFilter,
    cells: [] as ReturnType<typeof cellsOf>,
    refunds: [] as {
      receiptId: string | null
      no: string
      date: string
      amount: string
      status: string
    }[],
    rows: [] as ReturnType<typeof arRowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.arOrders,
    allLoaded: copy.state.allLoaded,
    buttons: [] as ButtonView[],
    busy: '',
    layers: [] as Layer[],
    layer: '',
    layerTitle: '',
    sheetError: '',
    orderSheet: null as ReturnType<typeof orderSheetOf> | null,
    afterSheet: null as ReturnType<typeof afterSheetOf> | null,
    texts: {
      after: copy.screen.label.after,
      allocations: copy.screen.label.allocations,
      voidAfter: copy.screen.action.voidAfter,
      voidReceipt: copy.screen.action.voidReceipt,
      confirmVoid: copy.screen.action.confirmVoid,
    },
  },
  id: '',
  pendingOrderId: '',
  list: null as PagedList<ArCard> | null,
  panel: null as PaymentPanel | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
    this.pendingOrderId = query.orderId ?? ''
    this.panel = new PaymentPanel(this, () => void this.list?.refresh())
    this.list = listOf(
      this,
      async (cursor) => {
        const { status, from, to } = listQueryOf<PayStatus>(this.data.filter)
        const input = { params: { id: this.id }, query: { status, from, to, cursor } }
        const result = await request(contract.getArCustomer, input)
        if (result.ok && cursor === undefined) {
          this.setData({
            title: result.data.customerName,
            counts: result.data.counts,
            cells: cellsOf(result.data),
            buttons: buttonsOf(result.data.actions, buttonSpecs),
            refunds: result.data.refunds.map((refund) => ({
              receiptId: refund.receiptId,
              no: refund.no,
              date: refund.refundDate,
              amount: textOfCents(refund.amountCents),
              status: labels.recordStatus[refund.status],
            })),
          })
        }
        return result
      },
      (card: ArCard) => arRowOf(card, false),
    )
  },
  onShow() {
    void this.list?.refresh()
    if (this.pendingOrderId) {
      void this.openOrder(this.pendingOrderId)
      this.pendingOrderId = ''
    }
    watch(this, [`ar:${this.id}`], () => {
      void this.list?.refresh()
      if (this.data.paymentLayer) void this.panel?.refresh()
    })
  },
  onAction(event: CodeEvent) {
    const mode = event.currentTarget.dataset.code === 'allocate' ? 'allocate' : 'receipt'
    void wx.navigateTo({
      url: `/packages/finance/pages/receive/index?mode=${mode}&customerId=${this.id}`,
    })
  },
  // 弹层换一层：记下来路，左上角返回上一层
  push(layer: Layer) {
    const layers = [...this.data.layers, layer]
    this.setData({ layers, layer, layerTitle: layerTitles[layer], sheetError: '' })
  },
  onSheetBack() {
    const layers = this.data.layers.slice(0, -1)
    const layer = layers.at(-1) ?? ''
    this.setData({ layers, layer, layerTitle: layer ? layerTitles[layer] : '', sheetError: '' })
  },
  onSheetClose() {
    this.setData({ layers: [], layer: '' })
  },
  showSheetError(result: Result<unknown>) {
    if (!result.ok)
      this.setData({ sheetError: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  async onOpen(event: KeyEvent): Promise<void> {
    await this.openOrder(event.currentTarget.dataset.key)
  },
  async openOrder(id: string): Promise<void> {
    this.setData({ layers: [], orderSheet: null })
    this.push('order')
    const result = await request(contract.getArOrder, {
      params: { id },
    })
    if (result.ok) this.setData({ orderSheet: orderSheetOf(result.data) })
    else this.showSheetError(result)
  },
  async onOpenAfter(event: KeyEvent): Promise<void> {
    this.push('after')
    this.setData({ afterSheet: null })
    const result = await request(contract.getFinanceAfter, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.showSheetError(result)
      return
    }
    this.setData({ afterSheet: afterSheetOf(result.data) })
  },
  async onOpenReceipt(event: KeyEvent): Promise<void> {
    await this.panel?.open(event.currentTarget.dataset.key, 'receipt')
  },
})
