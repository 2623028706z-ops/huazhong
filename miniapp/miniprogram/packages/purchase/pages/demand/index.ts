import {
  contract,
  copy,
  redesignCopy,
  formatQty,
  formatCardDate,
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

type Demand = OutputOf<typeof contract.listPurchaseDemand>
type Sources = OutputOf<typeof contract.listDemandSources>
function sourceGroupsOf(source: Sources, unit: string) {
  return source.groups.map((group) => ({
    shipDate: group.shipDate,
    title: copy.screen.sourceShipDate(formatCardDate(group.shipDate, shanghaiDateOf(Date.now()))),
    items: group.items.map((item) => ({
      orderId: item.orderId,
      title: [item.customerName, item.storeName].join(copy.separator),
      qty: formatQty(item.materialQty, unit),
      meta: `${redesignCopy.no} ${item.orderNo}${copy.separator}${item.productName} ${formatQty(item.qty, item.productUnit)} × ${item.bomQty}`,
    })),
  }))
}
function sourceSummaryOf(mat: Demand['mats'][number] | undefined) {
  if (!mat) return { sourceSummary: '', sourceLeft: '', sourceShort: false, sourceUnit: '' }
  return {
    sourceSummary: copy.screen.demandNumbers(mat.needQty, mat.stockQty, mat.inTransitQty),
    sourceLeft: copy.screen.leftQty(mat.leftQty),
    sourceShort: mat.leftQty < 0,
    sourceUnit: mat.unit,
  }
}
function rowsOf(demand: Demand, selected: string[]) {
  return demand.mats.map((m) => ({
    ...m,
    id: m.materialId,
    selected: selected.includes(m.materialId),
    range:
      m.shipFrom && m.shipTo
        ? copy.screen.sourceShipDate(
            m.shipFrom === m.shipTo ? m.shipFrom : `${m.shipFrom} ~ ${m.shipTo}`,
          )
        : copy.rework.noDemand,
    left: copy.screen.leftQty(m.leftQty),
    summary: copy.screen.demandNumbers(m.needQty, m.stockQty, m.inTransitQty),
    tags: [
      ...(m.invited ? [{ text: copy.screen.invited, warn: false }] : []),
      ...(!m.enabled ? [{ text: copy.screen.tag.discontinued, warn: true }] : []),
    ],
  }))
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
    shortageOnly: true,
    section: 'shortage',
    dateFilter: { ...emptyFilter, date: 'next7Days' },
    datePresets: ['today', 'tomorrow', 'next7Days', 'custom'],
    overdue: { count: 0, shipFrom: null as string | null, shipTo: null as string | null },
    overdueText: '',
    canInvite: false,
    canCreate: false,
    sourceSheet: false,
    sourceId: '',
    source: null as OutputOf<typeof contract.listDemandSources> | null,
    sourceSummary: '',
    sourceLeft: '',
    sourceShort: false,
    sourceUnit: '',
    sourceGroups: [] as {
      shipDate: string
      title: string
      items: { orderId: string; title: string; meta: string; qty: string }[]
    }[],
    supplierSheet: false,
    suppliers: [] as { id: string; name: string }[],
    supplierId: '',
    inviteSupplierId: '',
    texts: {
      all: redesignCopy.all,
      shortage: redesignCopy.shortage,
      toSupply: redesignCopy.toSupply,
      shipDate: redesignCopy.shipDate,
      from: copy.screen.label.from,
      to: copy.screen.label.to,
      invite: copy.screen.action.inviteSupplier,
      create: copy.screen.action.createPo,
      supplier: copy.screen.label.supplier,
      no: redesignCopy.no,
      qty: redesignCopy.qty,
      need: redesignCopy.need,
      next: copy.screen.action.next,
      source: copy.screen.label.origin,
      invited: copy.screen.invitedPending,
      noSuppliers: copy.screen.noInviteSupplier,
      empty: copy.screen.empty.demand,
      inTransitSources: copy.rework.inTransitSources,
      inTransitNote: copy.rework.inTransitNote,
      noShortage: copy.rework.noShortage,
      showAllMaterials: copy.rework.showAllMaterials,
      shortageOnly: copy.rework.shortageOnly,
    },
  },
  demand: null as Demand | null,
  loadVersion: 0,
  onLoad(query: Record<string, string | undefined>) {
    if (query.supplierId) this.setData({ inviteSupplierId: query.supplierId })
    if (query.tab === 'invites') this.setData({ section: 'invites' })
    const from = shanghaiDateOf(Date.now())
    this.setData({ from, to: addDays(from, DEMAND_DEFAULT_DAYS - 1) })
  },
  onShow() {
    void this.load()
    watch(this, ['demand'], () => void this.load())
  },
  async load() {
    const version = ++this.loadVersion
    const query = {
      from: this.data.from,
      to: this.data.to,
      shortageOnly: String(this.data.shortageOnly),
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
    const selected = this.data.selected.filter((id) =>
      result.data.mats.some((m) => m.materialId === id && m.enabled),
    )
    this.setData({
      loaded: true,
      failure: null,
      error: '',
      dateError: '',
      selected,
      rows: rowsOf(result.data, selected),
      overdue: result.data.overdue,
      overdueText: copy.rework.overdueSummary(result.data.overdue.count),
      count: copy.screen.orderCount(result.data.orderCount),
      canInvite: canDo(result.data.actions, 'inviteSupplier'),
      canCreate: canDo(result.data.actions, 'createPo'),
    })
    if (this.data.sourceSheet && this.data.sourceId) await this.openSource(this.data.sourceId)
  },
  onSection(event: KeyEvent) {
    const section = event.currentTarget.dataset.key
    this.setData({ section, shortageOnly: section === 'shortage' })
    if (section !== 'invites') void this.load()
  },
  onDemandFilter(event: DetailEvent<FilterValue>) {
    const range = rangeOf(event.detail, shanghaiDateOf(Date.now()))
    this.setData({
      dateFilter: event.detail,
      from: range?.from ?? shanghaiDateOf(Date.now()),
      to: range?.to ?? addDays(shanghaiDateOf(Date.now()), DEMAND_DEFAULT_DAYS - 1),
    })
    void this.load()
  },
  onFrom(event: DetailEvent<string>) {
    this.setData({ from: event.detail })
    void this.load()
  },
  onShortageOnly() {
    this.setData({ shortageOnly: !this.data.shortageOnly })
    void this.load()
  },
  onTo(event: DetailEvent<string>) {
    this.setData({ to: event.detail })
    void this.load()
  },
  onOverdue() {
    const { shipFrom, shipTo } = this.data.overdue
    if (!shipFrom || !shipTo) return
    this.setData({ from: shipFrom, to: shipTo })
    void this.load()
  },
  onToggle(event: KeyEvent) {
    const id = event.currentTarget.dataset.key
    if (!this.demand?.mats.some((mat) => mat.materialId === id && mat.enabled)) return
    const selected = this.data.selected.includes(id)
      ? this.data.selected.filter((k) => k !== id)
      : [...this.data.selected, id]
    this.setData({ selected, rows: rowsOf(this.demand, selected) })
  },
  onSource(event: KeyEvent) {
    return this.openSource(event.currentTarget.dataset.key)
  },
  async openSource(id: string) {
    const mat = this.demand?.mats.find((m) => m.materialId === id)
    this.setData({
      sourceSheet: true,
      sourceId: id,
      source: null,
      ...sourceSummaryOf(mat),
      sourceGroups: [],
      error: '',
    })
    const result = await request(contract.listDemandSources, {
      params: { materialId: id },
      query: { from: this.data.from, to: this.data.to },
    })
    if (result.ok)
      this.setData({
        source: result.data,
        sourceGroups: sourceGroupsOf(result.data, this.data.sourceUnit),
      })
    else this.setData({ error: failureOf(result.failure, 'refresh')?.message ?? '' })
  },
  onCloseSource() {
    this.setData({ sourceSheet: false })
  },
  onOpenSourcePo(event: KeyEvent) {
    this.setData({ sourceSheet: false })
    void wx.navigateTo({
      url: `/packages/purchase/pages/order-detail/index?id=${event.currentTarget.dataset.key}`,
    })
  },
  onOpenSourceInvite(event: KeyEvent) {
    this.setData({ sourceSheet: false })
    void wx.navigateTo({
      url: `/packages/purchase/pages/invite-detail/index?id=${event.currentTarget.dataset.key}`,
    })
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
        },
      },
    })
    this.setData({ supplierSheet: false, selected: [] })
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
