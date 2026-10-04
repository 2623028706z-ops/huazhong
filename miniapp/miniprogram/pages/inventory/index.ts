// M5 库存查询（06 章 M5）：没有仓库权限的员工只读查。搜索（名称、编码）+ 分类；停用的标「已停用」
import { contract, copy, type InventoryItem } from '@huazhong/shared'
import type { DetailEvent } from '../../core/events'
import type { FailureView } from '../../core/failure-view'
import { emptyFilter, type FilterDimension, type FilterValue } from '../../core/filter'
import { unwatch, watch, pullToRefresh } from '../../core/live'
import { PagedList } from '../../core/list'
import type { PagerView } from '../../core/pager'
import { request } from '../../core/request'
import { failureOf } from '../../core/session'

const CATEGORY = 'category'

function rowOf(item: InventoryItem) {
  return {
    id: item.id,
    aged: false,
    name: item.name,
    label: copy.screen.title.stock,
    qty: String(item.stockQty),
    unit: item.unit,
    sub: [`${copy.field.code} ${item.code}`, `${copy.field.category} ${item.categoryName}`].join(
      copy.separator,
    ),
    // 库存查询给所有员工只读用：不写已放天数
    age: '',
    disabled: !item.enabled,
    disabledText: copy.tag.disabled,
  }
}

Page({
  ...pullToRefresh,
  data: {
    title: copy.title.inventory,
    searchPlaceholder: copy.screen.materialSearch,
    emptyObject: copy.object.inventory,
    filter: emptyFilter,
    dimensions: [] as FilterDimension[],
    rows: [] as ReturnType<typeof rowOf>[],
    groups: [] as { key: string; title: string; count: string; rows: ReturnType<typeof rowOf>[] }[],
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<InventoryItem> | null,
  onLoad() {
    this.list = new PagedList(
      (cursor) => {
        const { keyword, picks } = this.data.filter
        const query = { q: keyword.trim() || undefined, categoryId: picks[CATEGORY], cursor }
        return request(contract.listInventory, { query })
      },
      (view: PagerView<InventoryItem>) => {
        const { items, ...rest } = view
        const rows = items.map(rowOf)
        // 不分组：一张卡列全部
        this.setData({
          ...rest,
          rows,
          groups: rows.length ? [{ key: 'all', title: '', count: '', rows }] : [],
        })
      },
      (patch) => {
        this.setData(patch)
      },
    )
  },
  onShow() {
    void this.loadCategories()
    void this.refresh()
    watch(this, ['stock'], () => {
      void this.refresh()
    })
  },
  onHide() {
    unwatch(this)
  },
  onUnload() {
    unwatch(this)
  },
  async loadCategories(): Promise<void> {
    const result = await request(contract.listMaterialCategories)
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'refresh') })
      return
    }
    const options = result.data.items.map(({ id, name }) => ({ id, name }))
    this.setData({ dimensions: [{ key: CATEGORY, label: copy.object.category, options }] })
  },
  async refresh(): Promise<void> {
    await this.list?.refresh()
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.refresh()
  },
  async onReachBottom(): Promise<void> {
    await this.list?.more()
  },
  onFailureAction() {
    void this.refresh()
  },
})
