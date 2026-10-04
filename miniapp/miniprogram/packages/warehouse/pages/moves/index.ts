import {
  contract,
  copy,
  redesignCopy,
  formatDayHeader,
  shanghaiDayOf,
  shanghaiDateOf,
  labels,
  type StockMove,
} from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listQueryOf, showList } from '../../../../views/list'
import { moveDocUrl, moveRowOf } from '../../../../views/stock'
import type { DetailEvent } from '../../../../core/events'
import type { FilterValue } from '../../../../core/filter'
function groupsOf(items: StockMove[]) {
  const groups: { day: string; title: string; rows: ReturnType<typeof moveRowOf>[] }[] = []
  for (const item of items) {
    const day = shanghaiDayOf(item.movedAt),
      last = groups[groups.length - 1],
      row = moveRowOf(item, { withName: false, date: false })
    if (last?.day === day) last.rows.push(row)
    else groups.push({ day, title: formatDayHeader(day, shanghaiDateOf(Date.now())), rows: [row] })
  }
  return groups
}
Page({
  ...listHandlers,
  data: {
    title: copy.stock.screen.materialMoves,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    filter: emptyFilter,
    dateLabel: copy.screen.label.date,
    rows: [] as ReturnType<typeof moveRowOf>[],
    head: { name: '', qty: '', unit: '', sub: '', disabled: false, disabledText: '', edit: '' },
    sections: [
      { key: '', text: redesignCopy.all },
      { key: 'in', text: copy.stock.screen.directionIn },
      { key: 'out', text: copy.stock.screen.directionOut },
    ],
    dimensions: [
      {
        key: 'type',
        label: copy.stock.screen.recordType,
        options: Object.entries(labels.moveType).map(([id, name]) => ({ id, name })),
      },
    ] as FilterDimension[],
    groups: [] as ReturnType<typeof groupsOf>,
    emptyObject: copy.stock.screen.empty.moves,
    allLoaded: copy.state.allLoaded,
  },
  materialId: '',
  list: null as PagedList<StockMove> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.materialId = query.materialId ?? ''
    this.list = new PagedList(
      async (cursor) => {
        const { from, to } = listQueryOf(this.data.filter)
        const direction =
          this.data.filter.status === 'in' || this.data.filter.status === 'out'
            ? this.data.filter.status
            : undefined
        const type = this.data.filter.picks.type
        const result = await request(contract.listStockMoves, {
          query: { cursor, from, to, direction, materialId: this.materialId },
        })
        // 接口没有细分类型条件，按本页结果筛
        if (result.ok && type)
          return {
            ...result,
            data: { ...result.data, items: result.data.items.filter((move) => move.type === type) },
          }
        return result
      },
      (view) => {
        const { items, ...rest } = view
        this.setData({
          ...rest,
          rows: items.map((item) => moveRowOf(item, { withName: false, date: false })),
          groups: groupsOf(items),
        })
      },
      (patch) => {
        this.setData(patch)
      },
    )
  },
  onShow() {
    showList(this, ['stock'])
    void this.loadHead()
  },
  // 顶上：花材名 + 当前库存，下面编码 / 分类
  async loadHead() {
    const result = await request(contract.getMaterial, { params: { id: this.materialId } })
    if (!result.ok) return
    const m = result.data
    this.setData({
      head: {
        name: m.name,
        qty: String(m.stockQty),
        unit: m.unit,
        sub: [`${copy.field.code} ${m.code}`, `${copy.field.category} ${m.categoryName}`].join(
          copy.separator,
        ),
        disabled: false,
        disabledText: '',
        edit: '',
      },
    })
  },
  onFilter(event: DetailEvent<FilterValue>) {
    this.setData({ filter: event.detail })
    void this.list?.refresh()
  },
  onDirection(event: DetailEvent<string>) {
    this.setData({ filter: { ...this.data.filter, status: event.detail } })
    void this.list?.refresh()
  },
  onOpen(event: KeyEvent) {
    const row = this.data.rows.find((item) => item.id === event.currentTarget.dataset.key)
    if (row) void wx.navigateTo({ url: moveDocUrl(row) })
  },
})
