import {
  contract,
  copy,
  redesignCopy,
  formatQty,
  formatTime,
  formatDayHeader,
  shanghaiDayOf,
  shanghaiDateOf,
  labels,
  type StockMove,
} from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter } from '../../../../core/filter'
import { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listQueryOf, showList } from '../../../../views/list'
function rowOf(move: StockMove) {
  return {
    id: move.id,
    title: move.materialName,
    headText: labels.moveType[move.type],
    docType: move.docType,
    docId: move.docId,
    fields: [
      { label: redesignCopy.no, value: move.docNo, wide: true },
      { label: copy.screen.label.date, value: formatTime(move.movedAt), wide: true },
      {
        label: redesignCopy.qty,
        value: `${move.qty > 0 ? '+' : ''}${formatQty(move.qty, move.unit)}`,
      },
      { label: copy.stock.screen.actor, value: move.actorName },
      { label: copy.screen.section.batches, value: move.batchLabel, wide: true },
    ],
  }
}
function groupsOf(items: StockMove[]) {
  const groups: { day: string; title: string; rows: ReturnType<typeof rowOf>[] }[] = []
  for (const item of items) {
    const day = shanghaiDayOf(item.movedAt),
      last = groups[groups.length - 1]
    if (last?.day === day) last.rows.push(rowOf(item))
    else
      groups.push({
        day,
        title: formatDayHeader(day, shanghaiDateOf(Date.now())),
        rows: [rowOf(item)],
      })
  }
  return groups
}
Page({
  ...listHandlers,
  data: {
    title: copy.stock.screen.titles.moves,
    loaded: false,
    skeleton: false,
    done: false,
    failure: null as FailureView | null,
    filter: emptyFilter,
    dateLabel: copy.screen.label.date,
    rows: [] as ReturnType<typeof rowOf>[],
    groups: [] as ReturnType<typeof groupsOf>,
    emptyObject: copy.stock.screen.empty.moves,
    allLoaded: copy.state.allLoaded,
    texts: {
      all: redesignCopy.all,
      in: copy.stock.screen.stockIn,
      out: copy.stock.screen.stockOut,
    },
  },
  materialId: '',
  list: null as PagedList<StockMove> | null,
  onLoad(query: Record<string, string | undefined>) {
    this.materialId = query.materialId ?? ''
    this.list = new PagedList(
      (cursor) => {
        const { from, to } = listQueryOf(this.data.filter)
        const direction =
          this.data.filter.status === 'in' || this.data.filter.status === 'out'
            ? this.data.filter.status
            : undefined
        return request(contract.listStockMoves, {
          query: { cursor, from, to, direction, materialId: this.materialId },
        })
      },
      (view) => {
        const { items, ...rest } = view
        this.setData({ ...rest, rows: items.map(rowOf), groups: groupsOf(items) })
      },
      (patch) => {
        this.setData(patch)
      },
    )
  },
  onShow() {
    showList(this, ['stock'])
  },
  onDirection(event: KeyEvent) {
    this.setData({ filter: { ...this.data.filter, status: event.currentTarget.dataset.key } })
    void this.list?.refresh()
  },
  onOpen(event: KeyEvent) {
    const row = this.data.rows.find((item) => item.id === event.currentTarget.dataset.key)
    if (!row) return
    const path =
      row.docType === 'po' ? 'receive' : row.docType === 'wh' ? 'doc-detail' : 'stocktake-detail'
    void wx.navigateTo({ url: `/packages/warehouse/pages/${path}/index?id=${row.docId}` })
  },
})
