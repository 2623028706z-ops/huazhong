import { contract, copy, formatQty, type OutputOf } from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { listHandlers, listOf, showList } from '../../../../views/list'
type Stock = OutputOf<typeof contract.warehouseStock>['items'][number]
function rowOf(m: Stock) {
  return {
    id: m.id,
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
    dimensions: [] as FilterDimension[],
    rows: [] as ReturnType<typeof rowOf>[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.object.inventory,
    allLoaded: copy.state.allLoaded,
    search: copy.filter.search(copy.object.material),
  },
  list: null as PagedList<Stock> | null,
  onLoad() {
    this.list = listOf(
      this,
      (cursor) =>
        request(contract.warehouseStock, {
          query: {
            cursor,
            q: this.data.filter.keyword,
            categoryId: this.data.filter.picks.category,
          },
        }),
      rowOf,
    )
  },
  onShow() {
    void this.loadCategories()
    showList(this, ['stock'])
  },
  async loadCategories() {
    const result = await request(contract.listMaterialCategories)
    if (result.ok)
      this.setData({
        dimensions: [{ key: 'category', label: copy.object.category, options: result.data.items }],
      })
    else this.setData({ failure: failureOf(result.failure, 'refresh') })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/warehouse/pages/material/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
