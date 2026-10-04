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
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { purchaseLineOf, type PurchaseDraft } from '../../../../views/purchase-form-data'
import { loadSuppliers } from '../../../../views/purchase-load'
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
      ...(m.invited ? [{ text: copy.screen.invited, warn: true }] : []),
      ...(!m.enabled ? [{ text: copy.screen.tag.discontinued, warn: true }] : []),
    ],
  }))
}
function defaultFilter(): FilterValue {
  return { ...emptyFilter, date: 'next7Days' }
}
Page({
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
    section: 'shortage',
    sections: [] as { key: string; text: string; count: number }[],
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
    supplierSheet: false,
    suppliers: [] as { id: string; name: string }[],
    supplierId: '',
    inviteSupplierId: '',
    texts: {
      shipDate: redesignCopy.shipDate,
      search: copy.screen.demandSearch,
      invite: copy.screen.action.inviteSupplier,
      create: copy.screen.action.createPo,
      supplier: copy.screen.label.supplier,
      next: copy.screen.action.next,
      source: copy.screen.label.origin,
      noSuppliers: copy.screen.noInviteSupplier,
    },
  },
  demand: null as Demand | null,
  pendingInvites: 0,
  loadVersion: 0,
  onLoad(query: Record<string, string | undefined>) {
    if (query.supplierId) this.setData({ inviteSupplierId: query.supplierId })
    if (query.tab === 'invites') this.setData({ section: 'invites' })
    this.syncRange(this.data.dateFilter)
    this.syncSections()
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
  syncSections() {
    const shortage = this.demand?.mats.filter((m) => m.leftQty < 0 && m.enabled).length ?? 0
    this.setData({
      sections: [
        { key: 'all', text: redesignCopy.all, count: 0 },
        { key: 'shortage', text: redesignCopy.shortage, count: shortage },
        { key: 'invites', text: redesignCopy.toSupply, count: this.pendingInvites },
      ],
    })
  },
  // 当前分段、搜索词下要列出的花材
  visibleMats(): Mat[] {
    const keyword = this.data.dateFilter.keyword.trim()
    return (this.demand?.mats ?? []).filter(
      (m) =>
        (this.data.section !== 'shortage' || m.leftQty < 0) &&
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
    const shortage = demand.mats.filter((m) => m.leftQty < 0).length
    const orders = copy.screen.orderCount(demand.orderCount)
    const keyword = this.data.dateFilter.keyword.trim()
    this.setData({
      selected,
      rows: rowsOf(mats, selected),
      count:
        this.data.section === 'shortage' && demand.orderCount
          ? [orders, copy.screen.shortageKinds(shortage)].join(copy.separator)
          : orders,
      emptyText:
        !keyword && demand.orderCount && this.data.section === 'shortage'
          ? copy.screen.noShortageHere
          : '',
      emptyObject: copy.screen.empty.demand,
      inviteText: countedOf(this.data.texts.invite, selected.length),
      createText: countedOf(this.data.texts.create, selected.length),
    })
    this.syncSections()
  },
  async load() {
    const version = ++this.loadVersion
    const query = {
      from: this.data.from,
      to: this.data.to,
      shortageOnly: 'false',
    }
    const checked = checkedOf(contract.listPurchaseDemand.query.safeParse(query))
    if (!checked.ok) {
      this.setData({ dateError: Object.values(checked.fields)[0] ?? '' })
      return
    }
    const [result, invites] = await Promise.all([
      request(contract.listPurchaseDemand, { query }),
      request(contract.listInvites, { query: { status: 'pending' } }),
    ])
    if (version !== this.loadVersion) return
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    if (invites.ok) this.pendingInvites = invites.data.counts.pending ?? 0
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
  onSection(event: DetailEvent<string>) {
    this.setData({ section: event.detail })
    this.render()
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
      supplierId: this.data.supplierId,
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
    this.setData({ supplierSheet: false, selected: [] })
    this.render()
  },
  onCreate() {
    this.enter(false)
  },
  async onInvite() {
    this.setData({ supplierSheet: true, supplierId: '', error: '' })
    const result = await loadSuppliers({ enabled: 'true', hasAccount: 'true' })
    if (result.ok) this.setData({ suppliers: result.data.map((s) => ({ id: s.id, name: s.name })) })
    else this.setData({ error: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onSupplier(event: DetailEvent<string>) {
    this.setData({ supplierId: event.detail, error: '' })
  },
  onCloseSupplier() {
    this.setData({ supplierSheet: false })
  },
  onNext() {
    if (!this.data.supplierId) {
      this.setData({ error: copy.screen.pickSupplier })
      return
    }
    this.enter(true)
  },
  onFailureAction() {
    void this.load()
  },
})
