import {
  contract,
  copy,
  redesignCopy,
  formatQty,
  DEMAND_DEFAULT_DAYS,
  addDays,
  gapOf,
  shanghaiDateOf,
  type OutputOf,
} from '@huazhong/shared'
import { emptyFilter, rangeOf, type FilterValue } from '../../../../core/filter'
import { canDo } from '../../../../core/actions'
import type { DetailEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { checkedOf } from '../../../../core/form'
import { unwatchOnLeave, watch, pullToRefresh } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { purchaseLineOf, type PurchaseDraft } from '../../../../views/purchase-form-data'
import {
  sourceSectionsOf,
  sourceTopOf,
  type SourceField,
  type SourceSection,
} from '../../../../views/purchase-demand-source'

type Demand = OutputOf<typeof contract.listPurchaseDemand>
type Mat = Demand['mats'][number]
function countedOf(text: string, count: number) {
  return count ? copy.screen.withCount(text, count) : text
}
function leftTextOf(mat: Mat) {
  return `${copy.screen.leftQty(mat.leftQty)} ${mat.unit}`
}
function rowsOf(mats: Mat[], selected: string[]) {
  return mats.map((m) => ({
    ...m,
    id: m.materialId,
    selected: selected.includes(m.materialId),
    range:
      m.shipFrom && m.shipTo
        ? m.shipFrom === m.shipTo
          ? m.shipFrom
          : `${m.shipFrom} ~ ${m.shipTo}`
        : copy.rework.noDemand,
    left: leftTextOf(m),
    needText: formatQty(m.needQty, m.unit),
    stockText: formatQty(m.stockQty, m.unit),
    transitText: formatQty(m.inTransitQty, m.unit),
    tags: [
      ...(m.invited ? [{ text: copy.screen.invited, warn: false }] : []),
      ...(!m.enabled ? [{ text: copy.screen.tag.discontinued, warn: false }] : []),
    ],
  }))
}
function defaultFilter(): FilterValue {
  return { ...emptyFilter, date: 'next7Days' }
}
Page({
  ...pullToRefresh,
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.demand,
    from: '',
    to: '',
    loaded: false,
    failure: null as FailureView | null,
    error: '',
    dateError: '',
    count: '',
    rows: [] as ReturnType<typeof rowsOf>,
    selected: [] as string[],
    dateFilter: defaultFilter(),
    datePresets: ['today', 'tomorrow', 'next7Days', 'custom'],
    overdue: { count: 0, shipFrom: null as string | null, shipTo: null as string | null },
    overdueText: '',
    emptyText: '',
    emptyObject: '',
    inviteText: '',
    createText: '',
    canInvite: false,
    canCreate: false,
    sourceSheet: false,
    sourceId: '',
    sourceName: '',
    sourceTop: [] as SourceField[],
    sourceSections: [] as SourceSection[],
    allSelected: false,
    selectAllText: redesignCopy.allSelected,
    texts: {
      shipDate: redesignCopy.shipDate,
      search: copy.screen.demandSearch,
      invite: copy.screen.action.inviteSupplier,
      create: copy.screen.action.createPo,
      source: copy.screen.label.origin,
    },
  },
  demand: null as Demand | null,
  loadVersion: 0,
  // 只看缺货花材（03 章第 8.2 节）；填报邀请在采购单页的「填报邀请」段
  onLoad() {
    this.syncRange(this.data.dateFilter)
  },
  onShow() {
    void this.load()
    watch(this, ['demand', 'invites'], () => void this.load())
  },
  syncRange(filter: FilterValue) {
    const today = shanghaiDateOf(Date.now())
    const range = rangeOf(filter, today) ?? {
      from: today,
      to: addDays(today, DEMAND_DEFAULT_DAYS - 1),
    }
    this.setData({ from: range.from, to: range.to })
  },
  // 搜索词下要列出的缺货花材
  visibleMats(): Mat[] {
    const keyword = this.data.dateFilter.keyword.trim()
    return (this.demand?.mats ?? []).filter(
      (m) =>
        m.leftQty < 0 &&
        (!keyword ||
          m.name.includes(keyword) ||
          m.invites.some((invite) => invite.supplierName.includes(keyword))),
    )
  },
  render() {
    const demand = this.demand
    if (!demand) return
    const selected = this.data.selected.filter((id) =>
      demand.mats.some((m) => m.materialId === id && m.enabled),
    )
    const mats = this.visibleMats()
    const pickable = mats.filter((m) => m.enabled)
    const shortage = demand.mats.filter((m) => m.leftQty < 0).length
    const orders = copy.screen.orderCount(demand.orderCount)
    const keyword = this.data.dateFilter.keyword.trim()
    this.setData({
      selected,
      allSelected: pickable.length > 0 && pickable.every((m) => selected.includes(m.materialId)),
      rows: rowsOf(mats, selected),
      count: demand.orderCount
        ? [orders, copy.screen.shortageKinds(shortage)].join(copy.separator)
        : orders,
      emptyText: !keyword && demand.orderCount ? copy.screen.noShortageHere : '',
      emptyObject: copy.screen.empty.demand,
      inviteText: countedOf(this.data.texts.invite, selected.length),
      createText: countedOf(this.data.texts.create, selected.length),
    })
  },
  async load() {
    const version = ++this.loadVersion
    const query = {
      from: this.data.from,
      to: this.data.to,
      // 整份需求取回来，页面只列缺口（leftQty < 0）的花材
      shortageOnly: 'false',
    }
    const checked = checkedOf(contract.listPurchaseDemand.query.safeParse(query))
    if (!checked.ok) {
      this.setData({ dateError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    const result = await request(contract.listPurchaseDemand, { query })
    if (version !== this.loadVersion) return
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    this.demand = result.data
    this.setData({
      loaded: true,
      failure: null,
      error: '',
      dateError: '',
      overdue: result.data.overdue,
      overdueText: copy.screen.overdueBar(result.data.overdue.count),
      canInvite: canDo(result.data.actions, 'inviteSupplier'),
      canCreate: canDo(result.data.actions, 'createPo'),
    })
    this.render()
    if (this.data.sourceSheet && this.data.sourceId) await this.openSource(this.data.sourceId)
  },
  onDemandFilter(event: DetailEvent<FilterValue>) {
    // 清掉日期条件就回到默认的未来 7 天
    const filter =
      event.detail.date === 'all' ? { ...event.detail, date: 'next7Days' as const } : event.detail
    const changed =
      filter.date !== this.data.dateFilter.date || filter.range !== this.data.dateFilter.range
    this.setData({ dateFilter: filter })
    if (changed) {
      this.syncRange(filter)
      void this.load()
    } else this.render()
  },
  onOverdue() {
    const { shipFrom, shipTo } = this.data.overdue
    if (!shipFrom || !shipTo) return
    const filter: FilterValue = {
      ...this.data.dateFilter,
      date: 'custom',
      range: { from: shipFrom, to: shipTo },
    }
    this.setData({ dateFilter: filter })
    this.syncRange(filter)
    void this.load()
  },
  onToggle(event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (!this.demand?.mats.some((mat) => mat.materialId === id && mat.enabled)) return
    const selected = this.data.selected.includes(id)
      ? this.data.selected.filter((k) => k !== id)
      : [...this.data.selected, id]
    this.setData({ selected })
    this.render()
  },
  // 全选 / 取消全选：当前列出的、没停用的花材
  onSelectAll() {
    const pickable = this.visibleMats()
      .filter((m) => m.enabled)
      .map((m) => m.materialId)
    const all = pickable.length > 0 && pickable.every((id) => this.data.selected.includes(id))
    this.setData({
      selected: all
        ? this.data.selected.filter((id) => !pickable.includes(id))
        : [...new Set([...this.data.selected, ...pickable])],
    })
    this.render()
  },
  onSource(event: KeyEvent) {
    return this.openSource(event.currentTarget.dataset.key)
  },
  async openSource(id: string) {
    const mat = this.demand?.mats.find((m) => m.materialId === id)
    this.setData({
      sourceSheet: true,
      sourceId: id,
      sourceName: mat?.name ?? '',
      sourceTop: sourceTopOf(mat),
      sourceSections: [],
      error: '',
    })
    const result = await request(contract.listDemandSources, {
      params: { materialId: id },
      query: { from: this.data.from, to: this.data.to },
    })
    if (result.ok) this.setData({ sourceSections: sourceSectionsOf(result.data, mat?.unit ?? '') })
    else this.setData({ error: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseSource() {
    this.setData({ sourceSheet: false })
  },
  onOpenBlock(event: DetailEvent<unknown, { key: string; kind: string }>) {
    const { key, kind } = event.currentTarget.dataset
    const page = kind === 'po' ? 'order-detail' : kind === 'invite' ? 'invite-detail' : ''
    if (!page) return
    this.setData({ sourceSheet: false })
    void wx.navigateTo({ url: `/packages/purchase/pages/${page}/index?id=${key}` })
  },
  draft(): PurchaseDraft {
    const mats = this.demand?.mats.filter((m) => this.data.selected.includes(m.materialId)) ?? []
    return {
      supplierId: '',
      demandContext: {
        from: this.data.from,
        to: this.data.to,
        expected: mats.map((mat) => ({
          materialId: mat.materialId,
          needQty: mat.needQty,
          stockQty: mat.stockQty,
          inTransitQty: mat.inTransitQty,
        })),
      },
      lines: mats.map((m) =>
        purchaseLineOf(
          { id: m.materialId, name: m.name, unit: m.unit },
          Math.max(1, gapOf(m.leftQty)),
        ),
      ),
    }
  },
  enter(invite: boolean) {
    const selection = this.draft()
    const page = invite ? 'invite-form' : 'order-form'
    wx.navigateTo({
      url: `/packages/purchase/pages/${page}/index`,
      success: (res) => {
        res.eventChannel.emit('selection', selection)
      },
      events: {
        saved: () => {
          this.setData({ selected: [] })
          this.render()
        },
      },
    })
    this.setData({ selected: [] })
    this.render()
  },
  onCreate() {
    this.enter(false)
  },
  // 供应商直接在 C7 里选，这里不再先选一次
  onInvite() {
    this.enter(true)
  },
  onFailureAction() {
    void this.load()
  },
})
