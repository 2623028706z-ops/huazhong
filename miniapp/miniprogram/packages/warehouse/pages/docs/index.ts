import { contract, copy, type WhDocCard } from '@huazhong/shared'
import { canDo } from '../../../../core/actions'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { loadSuppliers } from '../../../../views/purchase-load'
import { stockRowOf } from '../../../../views/stock'

Page({
  ...listHandlers,
  data: { title: '', kind: 'in', statusKind: 'whDocStatus', statuses: ['stocked_in', 'voided'], counts: {}, dimensions: [] as FilterDimension[], dateLabel: '', filter: emptyFilter, loaded: false, skeleton: false, done: false, failure: null as FailureView | null, rows: [] as ReturnType<typeof stockRowOf>[], emptyObject: '', allLoaded: copy.state.allLoaded, canCreate: false, createText: '' },
  list: null as PagedList<WhDocCard> | null,
  onLoad(query: Record<string, string | undefined>) {
    const kind = query.kind === 'out' || query.kind === 'loss' ? query.kind : 'in'
    this.setData({ kind, title: copy.stock.screen.titles[kind], emptyObject: copy.stock.screen.empty[kind], dateLabel: copy.stock.screen.date[kind], createText: copy.stock.screen.create[kind], statuses: [kind === 'in' ? 'stocked_in' : kind === 'out' ? 'stocked_out' : 'lost', 'voided'] })
    this.list = listOf(this, async (cursor) => {
      const { status, from, to, picks } = listQueryOf<WhDocCard['status']>(this.data.filter)
      const result = await request(contract.listWhDocs, { query: { kind, status, from, to, supplierId: picks.supplier, outCategoryId: picks.category, cursor } })
      if (result.ok) this.setData({ canCreate: canDo(result.data.actions, 'create') })
      return result
    }, stockRowOf)
  },
  onShow() { showList(this, ['wh_docs', 'stock']); void this.loadDimensions() },
  async loadDimensions() {
    if (this.data.kind === 'in') {
      const result = await loadSuppliers()
      if (result.ok) this.setData({ dimensions: [{ key: 'supplier', label: copy.screen.label.supplier, options: result.data.map((row) => ({ id: row.id, name: row.name })) }] })
    } else if (this.data.kind === 'out') {
      const result = await request(contract.listOutCategories)
      if (result.ok) this.setData({ dimensions: [{ key: 'category', label: copy.stock.screen.outCategory, options: result.data.items.map((row) => ({ id: row.id, name: row.name })) }] })
    }
  },
  onOpen(event: KeyEvent) { void wx.navigateTo({ url: `/packages/warehouse/pages/doc-detail/index?id=${event.currentTarget.dataset.key}` }) },
  onCreate() { if (this.data.canCreate) void wx.navigateTo({ url: `/packages/warehouse/pages/doc-form/index?kind=${this.data.kind}` }) },
})
