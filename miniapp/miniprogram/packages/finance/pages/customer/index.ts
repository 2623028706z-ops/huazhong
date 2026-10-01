// F3 客户对账详情（06 章 F3）：筛选收款状态、出货日期（默认全部）→ 对账格 → 发货单三行卡片。
// 底部「核销预收」（allocate，次）、「登记收款」（registerReceipt）→ F4。
// 同一个弹层里切换：发货单 → 售后详情（作废售后）/ 收款详情（作废收款），左上角返回上一层
import {
  contract,
  copy,
  payStatuses,
  type AfterDetail,
  type ArCard,
  type PayStatus,
  type ReceiptDetail,
} from '@huazhong/shared'
import { buttonsOf, type ButtonView } from '../../../../core/actions'
import type { CodeEvent, DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request, type Result } from '../../../../core/request'
import { failureOf, messageOf } from '../../../../core/session'
import { showSuccess } from '../../../../core/toast'
import { previewImage } from '../../../../views/after'
import { arRowOf } from '../../../../views/ar'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { receiptViewOf } from '../../receipt-view'
import { afterSheetOf, cellsOf, orderSheetOf } from './view'

type Layer = 'order' | 'after' | 'receipt'

// 标成 string：取到客户名后换成客户名
const DEFAULT_TITLE: string = copy.screen.title.arCustomer
const buttonSpecs = [{ code: 'allocate', secondary: true }, { code: 'registerReceipt' }] as const
const layerTitles: Record<Layer, string> = {
  order: copy.screen.label.shipAmount,
  after: copy.screen.title.afterDetail,
  receipt: copy.screen.title.receipt,
}

Page({
  ...listHandlers,
  data: {
    title: DEFAULT_TITLE,
    statusKind: 'payStatus',
    statuses: [...payStatuses],
    counts: {},
    dateLabel: copy.field.shipDate,
    filter: emptyFilter,
    cells: [] as ReturnType<typeof cellsOf>,
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
    receiptSheet: null as ReturnType<typeof receiptViewOf> | null,
    voidSheet: false,
    voidRequired: false,
    voidError: '',
    texts: {
      after: copy.screen.label.after,
      allocations: copy.screen.label.allocations,
      voidAfter: copy.screen.action.voidAfter,
      voidReceipt: copy.screen.action.voidReceipt,
      confirmVoid: copy.screen.action.confirmVoid,
    },
  },
  id: '',
  list: null as PagedList<ArCard> | null,
  after: null as AfterDetail | null,
  receipt: null as ReceiptDetail | null,
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
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
          })
        }
        return result
      },
      (card: ArCard) => arRowOf(card, false),
    )
  },
  onShow() {
    showList(this, [`ar:${this.id}`])
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
    this.setData({ layers: [], orderSheet: null })
    this.push('order')
    const result = await request(contract.getArOrder, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (result.ok) this.setData({ orderSheet: orderSheetOf(result.data) })
    else this.showSheetError(result)
  },
  async onOpenAfter(event: KeyEvent): Promise<void> {
    this.push('after')
    this.setData({ afterSheet: null })
    const result = await request(contract.getAfter, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.showSheetError(result)
      return
    }
    this.after = result.data
    this.setData({ afterSheet: afterSheetOf(result.data) })
  },
  async onOpenReceipt(event: KeyEvent): Promise<void> {
    this.push('receipt')
    this.setData({ receiptSheet: null })
    const result = await request(contract.getReceipt, {
      params: { id: event.currentTarget.dataset.key },
    })
    if (!result.ok) {
      this.showSheetError(result)
      return
    }
    this.receipt = result.data
    this.setData({ receiptSheet: receiptViewOf(result.data) })
  },
  onVoid() {
    const required =
      this.data.layer === 'after'
        ? this.data.afterSheet?.voidRequired
        : this.data.receiptSheet?.voidRequired
    this.setData({ voidSheet: true, voidRequired: required === true, voidError: '' })
  },
  onCloseVoid() {
    this.setData({ voidSheet: false })
  },
  async onSubmitVoid(event: DetailEvent<string>): Promise<void> {
    this.setData({ busy: 'void', voidError: '' })
    const reason = event.detail
    if (this.data.layer === 'after' && this.after) {
      const input = { params: { id: this.after.id }, body: { version: this.after.version, reason } }
      const result = await request(contract.voidAfter, input)
      if (result.ok) this.setData({ afterSheet: afterSheetOf(result.data) })
      this.afterVoid(result, copy.after.voided)
    } else if (this.receipt) {
      const input = {
        params: { id: this.receipt.id },
        body: { version: this.receipt.version, reason },
      }
      const result = await request(contract.voidReceipt, input)
      if (result.ok) this.setData({ receiptSheet: receiptViewOf(result.data) })
      this.afterVoid(result, copy.finance.receiptVoided)
    }
  },
  afterVoid(result: Result<AfterDetail | ReceiptDetail>, done: string) {
    this.setData({ busy: '' })
    if (result.ok) {
      this.setData({ voidSheet: false })
      showSuccess(done)
      void this.list?.refresh()
      return
    }
    const view = failureOf(result.failure, 'submit')
    if (!view) return
    const message = messageOf(view)
    this.setData({ voidError: message })
  },
  onPreview: previewImage,
})
