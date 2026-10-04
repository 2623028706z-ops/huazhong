import { contract, copy, redesignCopy, formatQty, type OutputOf } from '@huazhong/shared'
import type { KeyEvent, DetailEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf, loadMe, tabsOf } from '../../../../core/session'
import { listHandlers, listOf, showList } from '../../../../views/list'
type Stock = OutputOf<typeof contract.warehouseStock>['items'][number]
function rowOf(m: Stock) {
  return {
    id: m.id,
    aged: m.aged,
    fields: [
      { label: copy.screen.title.stock, value: formatQty(m.stockQty, m.unit) },
      { label: copy.field.code, value: m.code },
      { label: copy.field.category, value: m.categoryName },
      ...(m.oldestAgeDays === null
        ? []
        : [{ label: redesignCopy.stockAge, value: redesignCopy.age(m.oldestAgeDays) }]),
    ],
    title: m.name,
    total: formatQty(m.stockQty, m.unit),
    meta: [m.code, m.categoryName].join(copy.separator),
    keyTotal: m.stockQty > 0,
    tags: m.enabled ? [] : [{ text: copy.tag.disabled, warn: false }],
  }
}
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.stock,
    filter: emptyFilter,
    agedOnly: false,
    back: true,
    tabs: [] as ReturnType<typeof tabsOf>,
    hasAged: false,
    hasOther: false,
    dimensions: [] as FilterDimension[],
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.object.inventory,
    allLoaded: copy.state.allLoaded,
    search: copy.filter.search(copy.object.material),
    texts: { old: redesignCopy.oldStock, other: redesignCopy.otherStock },
  },
  agedOnly: false,
  list: null as PagedList<Stock> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.agedOnly = query.aged === 'true'
    this.setData({ agedOnly: this.agedOnly })
    this.list = listOf(
      {
        setData: (patch: Record<string, unknown>) => {
          const rows = patch.rows as ReturnType<typeof rowOf>[] | undefined
          this.setData(
            rows
              ? {
                  ...patch,
                  hasAged: rows.some((row) => row.aged),
                  hasOther: rows.some((row) => !row.aged),
                }
              : patch,
          )
        },
      },
      (cursor) =>
        request(contract.warehouseStock, {
          query: {
            cursor,
            aged: this.agedOnly ? 'true' : undefined,
            q: this.data.filter.keyword,
            categoryId: this.data.filter.picks.category,
          },
        }),
      rowOf,
    )
  },
  onShow() {
    void this.loadNavigation()
    void this.loadCategories()
    showList(this, ['stock'])
  },
  async loadNavigation() {
    const result = await loadMe()
    if (result.ok) {
      const top = result.data.landing === 'module:warehouse'
      this.setData({ back: !top, tabs: top ? tabsOf(result.data) : [] })
    }
  },
  async loadCategories() {
    const result = await request(contract.listMaterialCategories)
    if (result.ok)
      this.setData({
        dimensions: [{ key: 'category', label: copy.object.category, options: result.data.items }],
      })
    else this.setData({ failure: failureOf(result.failure, 'refresh') })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail, hasAged: false, hasOther: false })
    void this.list?.refresh()
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/warehouse/pages/material/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
