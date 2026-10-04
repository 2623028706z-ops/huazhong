import { contract, copy, redesignCopy, type OutputOf } from '@huazhong/shared'
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
    name: m.name,
    label: copy.screen.title.stock,
    qty: String(m.stockQty),
    unit: m.unit,
    sub: [`${copy.field.code} ${m.code}`, `${copy.field.category} ${m.categoryName}`].join(
      copy.separator,
    ),
    age: m.oldestAgeDays === null ? '' : redesignCopy.age(m.oldestAgeDays),
    disabled: !m.enabled,
    disabledText: copy.tag.disabled,
  }
}
type Row = ReturnType<typeof rowOf>
// 放久了 · 先用（琥珀色、在上）和其他，一组一张卡
function groupsOf(rows: Row[]) {
  const aged = rows.filter((row) => row.aged)
  const other = rows.filter((row) => !row.aged)
  return [
    {
      key: 'aged',
      aged: true,
      title: redesignCopy.oldStock,
      count: copy.screen.kinds(aged.length),
      rows: aged,
    },
    {
      key: 'other',
      aged: false,
      title: redesignCopy.otherStock,
      count: copy.screen.kinds(other.length),
      rows: other,
    },
  ].filter((group) => group.rows.length)
}
Page({
  ...listHandlers,
  data: {
    title: copy.screen.title.stock,
    filter: emptyFilter,
    back: true,
    tabs: [] as ReturnType<typeof tabsOf>,
    sections: [] as { key: string; text: string }[],
    section: '',
    dimensions: [] as FilterDimension[],
    rows: [] as Row[],
    groups: [] as ReturnType<typeof groupsOf>,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    emptyObject: copy.object.inventory,
    allLoaded: copy.state.allLoaded,
    search: copy.screen.materialSearch,
    texts: {
      manage: copy.screen.action.manageCategories,
      create: copy.screen.action.createMaterial,
    },
  },
  list: null as PagedList<Stock> | null,
  onLoad() {
    this.list = listOf(
      {
        setData: (patch: Record<string, unknown>) => {
          const rows = patch.rows as Row[] | undefined
          this.setData(rows ? { ...patch, groups: groupsOf(rows) } : patch)
        },
      },
      async (cursor) => {
        const { keyword, picks } = this.data.filter
        const result = await request(contract.warehouseStock, {
          query: { cursor, q: keyword, categoryId: picks.category },
        })
        // 接口没有启用 / 停用条件，按本页结果筛
        if (result.ok && picks.enabled)
          return {
            ...result,
            data: {
              ...result.data,
              items: result.data.items.filter((m) => m.enabled === (picks.enabled === 'true')),
            },
          }
        return result
      },
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
        sections: [
          { key: '', text: redesignCopy.all },
          ...result.data.items.map((item) => ({ key: item.id, text: item.name })),
        ],
        dimensions: [
          {
            key: 'enabled',
            label: copy.field.status,
            options: [
              { id: 'true', name: copy.statusValue.enabled },
              { id: 'false', name: copy.statusValue.disabled },
            ],
          },
        ],
      })
    else this.setData({ failure: failureOf(result.failure, 'refresh') })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.list?.refresh()
  },
  // 分类标签：全部 / 各分类
  onSection(event: DetailEvent<string>) {
    const picks = { ...this.data.filter.picks }
    if (event.detail) picks.category = event.detail
    else delete picks.category
    this.setData({ section: event.detail, filter: { ...this.data.filter, picks } })
    void this.list?.refresh()
  },
  onManage() {
    void wx.navigateTo({ url: '/packages/warehouse/pages/materials/index?open=categories' })
  },
  onCreate() {
    void wx.navigateTo({ url: '/packages/warehouse/pages/materials/index?open=create' })
  },
  onOpen(event: KeyEvent) {
    void wx.navigateTo({
      url: `/packages/warehouse/pages/material/index?id=${event.currentTarget.dataset.key}`,
    })
  },
})
