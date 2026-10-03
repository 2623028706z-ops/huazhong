import {
  contract,
  copy,
  formatQty,
  formatTime,
  labels,
  moveTypes,
  type StockMove,
} from '@huazhong/shared'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { emptyFilter, type FilterDimension } from '../../../../core/filter'
import type { PagedList } from '../../../../core/list'
import { request } from '../../../../core/request'
import { listHandlers, listOf, listQueryOf, showList } from '../../../../views/list'
import { loadInventory } from '../../../../views/purchase-load'

function rowOf(move: StockMove) {
  return {
    id: move.id,
    date: formatTime(move.movedAt),
    status: '',
    headText: labels.moveType[move.type],
    title: move.materialName,
    total: `${move.qty > 0 ? '+' : ''}${formatQty(move.qty, move.unit)}`,
    totalTone: move.qty > 0 ? 'gain' : 'loss',
    meta: [move.docNo, move.batchLabel, move.actorName].join(copy.separator),
    amount: null,
    tags: [],
    docType: move.docType,
    docId: move.docId,
  }
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
    dimensions: [
      {
        key: 'type',
        label: copy.stock.screen.recordType,
        options: moveTypes.map((type) => ({ id: type, name: labels.moveType[type] })),
      },
    ] as FilterDimension[],
    dateLabel: copy.screen.label.date,
    rows: [] as ReturnType<typeof rowOf>[],
    emptyObject: copy.stock.screen.empty.moves,
    allLoaded: copy.state.allLoaded,
  },
  list: null as PagedList<StockMove> | null,
  onLoad(query: Record<string, string | undefined>) {
    if (query.materialId)
      this.setData({ filter: { ...emptyFilter, picks: { material: query.materialId } } })
    this.list = listOf(
      this,
      (cursor) => {
        const { from, to, picks } = listQueryOf(this.data.filter)
        const type = moveTypes.find((value) => value === picks.type)
        return request(contract.listStockMoves, {
          query: { cursor, from, to, type, materialId: picks.material },
        })
      },
      rowOf,
    )
    void this.loadMaterials()
  },
  async loadMaterials() {
    const result = await loadInventory()
    if (result.ok)
      this.setData({
        dimensions: [
          ...this.data.dimensions.filter((row) => row.key === 'type'),
          {
            key: 'material',
            label: copy.screen.title.materials,
            options: result.data.map((row) => ({ id: row.id, name: row.name })),
          },
        ],
      })
  },
  onShow() {
    showList(this, ['stock'])
  },
  onOpen(event: KeyEvent) {
    const row = this.data.rows.find((item) => item.id === event.currentTarget.dataset.key)
    if (!row) return
    const path =
      row.docType === 'po' ? 'receive' : row.docType === 'wh' ? 'doc-detail' : 'stocktake-detail'
    void wx.navigateTo({ url: `/packages/warehouse/pages/${path}/index?id=${row.docId}` })
  },
})
