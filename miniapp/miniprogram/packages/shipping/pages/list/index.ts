// H2 发货单（06 章 H2）：状态（待发货、已发货）+ 搜索（客户、门店）；待发货里也列出货日期以后的单。点开 → H3
import { contract, copy, redesignCopy, type ShippingCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import { clearPicking, loadPicking } from '../../../../core/picking'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { failureOf } from '../../../../core/session'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { shippingRowOf } from '../../../../views/order'

type ShipStatus = 'to_ship' | 'shipped'
const statuses: ShipStatus[] = ['to_ship', 'shipped']

// 筛选栏「全部」= 不传状态，待发货和已发货都查
function statusOf(value: string): ShipStatus | undefined {
  return statuses.find((status) => status === value)
}

const BATCH_PREVIEW_COUNT = 3
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.shipList,
    statusKind: 'orderStatus',
    statuses,
    counts: {},
    searchPlaceholder: copy.screen.label.searchShipments,
    filter: emptyFilter,
    rows: [] as (Omit<ReturnType<typeof shippingRowOf>, 'fields'> & {
      fields: { label: string; value: string; wide?: boolean }[]
    })[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.screen.empty.shipments,
    allLoaded: copy.state.allLoaded,
    selected: [] as { id: string; version: number; no: string }[],
    batchSheet: false,
    batchBusy: false,
    batchError: '',
    batchNos: [] as string[],
    batchText: redesignCopy.shipMany(0),
    texts: {
      allSelected: redesignCopy.allSelected,
      shipOrders: redesignCopy.shipOrders,
      shipConfirmation: redesignCopy.shipConfirmation,
    },
  },
  dueOnly: false,
  cards: [] as ShippingCard[],
  list: null as PagedList<ShippingCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.dueOnly = query.dueOnly === 'true'
    this.setData({ filter: { ...emptyFilter, status: statusOf(query.status ?? '') ?? '' } })
    this.list = listOf(
      this,
      async (cursor) => {
        const { q } = listQueryOf(this.data.filter)
        const status = statusOf(this.data.filter.status)
        const result = await request(contract.listShippingOrders, {
          query: { status, q, cursor, dueOnly: this.dueOnly ? 'true' : undefined },
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
  rowOf(order: ShippingCard) {
    const row = shippingRowOf(order)
    return {
      ...row,
      selectable: order.status === 'to_ship',
      selectDisabled: !canDo(order.actions, 'ship'),
      selected: this.data.selected.some((p) => p.id === order.id),
      fields: [
        ...row.fields,
        ...(order.status === 'to_ship'
          ? [
              {
                label: redesignCopy.picking,
                value: redesignCopy.packed(loadPicking(order.id).length, order.lineCount),
                wide: true,
              },
            ]
          : []),
      ],
    }
  },
  renderSelection() {
    this.setData({
      rows: this.cards.map((order) => this.rowOf(order)),
      batchText: redesignCopy.shipMany(this.data.selected.length),
    })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail, selected: [], batchText: redesignCopy.shipMany(0) })
    void this.list?.refresh()
  },
  onToggle(event: KeyEvent) {
    const order = this.cards.find((row) => row.id === event.currentTarget.dataset.key)
    if (!order || !canDo(order.actions, 'ship')) return
    const selected = this.data.selected.some((row) => row.id === order.id)
      ? this.data.selected.filter((row) => row.id !== order.id)
      : [...this.data.selected, { id: order.id, version: order.version, no: order.no }]
    this.setData({ selected })
    this.renderSelection()
  },
  onSelectAll() {
    const eligible = this.cards.filter((row) => canDo(row.actions, 'ship'))
    const all = eligible.every((row) => this.data.selected.some((p) => p.id === row.id))
    this.setData({
      selected: all
        ? []
        : eligible.map((row) => ({ id: row.id, version: row.version, no: row.no })),
    })
    this.renderSelection()
  },
  onOpenBatch() {
    if (!this.data.selected.length) return
    this.setData({
      batchSheet: true,
      batchError: '',
      batchNos: [
        ...this.data.selected.slice(0, BATCH_PREVIEW_COUNT).map((row) => row.no),
        ...(this.data.selected.length > BATCH_PREVIEW_COUNT
          ? [redesignCopy.moreOrders(this.data.selected.length)]
          : []),
      ],
    })
  },
  onCloseBatch() {
    if (!this.data.batchBusy) this.setData({ batchSheet: false })
  },
  async onConfirmBatch() {
    if (this.data.batchBusy) return
    this.setData({ batchBusy: true, batchError: '' })
    const result = await request(contract.batchShipOrders, {
      body: { orders: this.data.selected.map(({ id, version }) => ({ id, version })) },
    })
    this.setData({ batchBusy: false })
    if (!result.ok) {
      this.setData({ batchError: failureOf(result.failure, 'submit')?.message ?? '' })
      return
    }
    for (const row of result.data.succeeded) clearPicking(row.id)
    const message = result.data.failed.length
      ? redesignCopy.shipmentResult(
          result.data.failed.length,
          result.data.failed.map((row) => `${row.no} ${row.reason}`).join(copy.separator),
        )
      : copy.order.shipped
    this.setData({ selected: [], batchSheet: false })
    await this.list?.refresh()
    void wx.showToast({ title: message, icon: 'none' })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/shipping/pages/ship/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
