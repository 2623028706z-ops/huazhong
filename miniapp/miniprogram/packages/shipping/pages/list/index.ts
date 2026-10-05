// H2 发货单（06 章 H2）：状态（待发货、已发货）+ 搜索（客户、门店）；待发货里也列出货日期以后的单。点开 → H3。
// 首页进来（不带状态）默认停在「待发货」。批量按统一勾选写法（views/batch.ts）：「全部」「待发货」能勾，
// 出货日期没到的后台给的 ship 是禁用，不能勾；发完弹「发货结果」，从送货单、详情返回还停在弹层上
import { contract, copy, redesignCopy, type ShippingCard } from '@huazhong/shared'
import { clearPicking, loadPicking } from '../../../../core/picking'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { confirmAsk } from '../../../../core/guard'
import { failureOf } from '../../../../core/session'
import { request } from '../../../../core/request'
import { allToggled, checkOf, showsChecks, toggled, type Picked } from '../../../../views/batch'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { shippingRowOf } from '../../../../views/order'
import { shipResultOf, type ShipResultRow } from '../../../../views/ship-result'
import { pullToRefresh } from '../../../../core/live'

type ShipStatus = 'to_ship' | 'shipped'
const statuses: ShipStatus[] = ['to_ship', 'shipped']

// 筛选栏「全部」= 不传状态，待发货和已发货都查
function statusOf(value: string): ShipStatus | undefined {
  return statuses.find((status) => status === value)
}

// 能批量发货的页签
const SHIPPABLE: ShipStatus = 'to_ship'
const BATCH_PREVIEW_COUNT = 3
const DUE = 'due'
const dimensions: FilterDimension[] = [
  { key: DUE, label: redesignCopy.dueFilter, options: [{ id: 'true', name: redesignCopy.due }] },
]
Page({
  ...pullToRefresh,
  ...listHandlers,
  data: {
    title: copy.screen.title.shipList,
    statusKind: 'orderStatus',
    statuses,
    counts: {},
    searchPlaceholder: copy.screen.label.searchShipments,
    dimensions,
    filter: emptyFilter,
    rows: [] as (ReturnType<typeof shippingRowOf> & ReturnType<typeof checkOf>)[],
    selection: true,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.shipments,
    allLoaded: copy.state.allLoaded,
    selected: [] as Picked[],
    batchText: redesignCopy.shipMany(0),
    batchBusy: false,
    result: false,
    resultHead: '',
    resultRows: [] as ShipResultRow[],
    texts: {
      allSelected: redesignCopy.allSelected,
      resultTitle: copy.flow.ship.resultTitle,
      gotIt: redesignCopy.gotIt,
    },
  },
  cards: [] as ShippingCard[],
  list: null as PagedList<ShippingCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    // 不带状态（发货首页「发货单」入口）默认待发货；status=all 才是全部
    const status = query.status === undefined ? 'to_ship' : (statusOf(query.status) ?? '')
    this.setData({
      filter: {
        ...emptyFilter,
        status,
        picks: query.dueOnly === 'true' ? { [DUE]: 'true' } : {},
      },
      selection: showsChecks(status, SHIPPABLE),
    })
    this.list = listOf(
      this,
      async (cursor) => {
        const { q, picks } = listQueryOf(this.data.filter)
        const status = statusOf(this.data.filter.status)
        const result = await request(contract.listShippingOrders, {
          query: { status, q, cursor, dueOnly: picks[DUE] ? 'true' : undefined },
        })
        if (result.ok) {
          this.cards = cursor ? [...this.cards, ...result.data.items] : result.data.items
          this.setData({ counts: result.data.counts })
        }
        return result
      },
      (order) => this.rowOf(order),
    )
  },
  onShow() {
    showList(this, ['orders'])
  },
  // 待发货的卡右下写配货 n/m 种（配货勾选存在本机）
  rowOf(order: ShippingCard) {
    const packed = loadPicking(order.id).length
    return {
      ...shippingRowOf(order),
      ...checkOf(order, 'ship', this.data.selected),
      note: order.status === 'to_ship' ? redesignCopy.packedState(packed, order.lineCount) : '',
    }
  },
  renderSelection(selected: Picked[]) {
    this.setData({ selected, batchText: redesignCopy.shipMany(selected.length) })
    this.setData({ rows: this.cards.map((order) => this.rowOf(order)) })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({
      filter: event.detail,
      selection: showsChecks(event.detail.status, SHIPPABLE),
      selected: [],
      batchText: redesignCopy.shipMany(0),
    })
    void this.list?.refresh()
  },
  onToggle(event: KeyEvent) {
    const order = this.cards.find((row) => row.id === event.currentTarget.dataset.key)
    if (order) this.renderSelection(toggled(this.data.selected, order, 'ship'))
  },
  onSelectAll() {
    this.renderSelection(allToggled(this.data.selected, this.cards, 'ship'))
  },
  async onOpenBatch() {
    const { selected } = this.data
    if (!selected.length || this.data.batchBusy) return
    const lines = selected.slice(0, BATCH_PREVIEW_COUNT).map((row) => {
      const order = this.cards.find((card) => card.id === row.id)
      return [order ? copy.org.store(order.customerName, order.storeName) : '', row.no].join(
        copy.separator,
      )
    })
    if (selected.length > BATCH_PREVIEW_COUNT) lines.push(redesignCopy.moreOrders(selected.length))
    const confirmed = await confirmAsk(this, {
      title: redesignCopy.shipOrders,
      body: [
        ...lines,
        redesignCopy.shipSummary(selected.length),
        redesignCopy.shipDifferenceHint,
      ].join('\n'),
      cancel: copy.action.back,
      confirm: redesignCopy.shipOrders,
    })
    if (confirmed) await this.onConfirmBatch()
  },
  async onConfirmBatch() {
    if (this.data.batchBusy) return
    this.setData({ batchBusy: true })
    const result = await request(contract.batchShipOrders, {
      body: { orders: this.data.selected.map(({ id, version }) => ({ id, version })) },
    })
    this.setData({ batchBusy: false })
    if (!result.ok) {
      void wx.showToast({ title: failureOf(result.failure, 'submit')?.message ?? '', icon: 'none' })
      return
    }
    for (const row of result.data.succeeded) clearPicking(row.id)
    const view = shipResultOf(result.data)
    this.setData({
      selected: [],
      batchText: redesignCopy.shipMany(0),
      result: true,
      resultHead: view.head,
      resultRows: view.rows,
    })
    await this.list?.refresh()
  },
  // 结果弹层里点一行：发出的进送货单，没发出的进这张单；返回时弹层还在
  onResultRow(event: KeyEvent) {
    const row = this.data.resultRows.find((item) => item.id === event.currentTarget.dataset.key)
    if (!row) return
    const page = row.failed ? 'ship' : 'delivery'
    void wx.navigateTo({ url: `/packages/shipping/pages/${page}/index?id=${row.id}` })
  },
  onCloseResult() {
    this.setData({ result: false })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/shipping/pages/ship/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
