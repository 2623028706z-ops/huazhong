import {
  contract,
  copy,
  redesignCopy,
  STOCK_AGE_WARNING_DAYS,
  formatQty,
  type OutputOf,
} from '@huazhong/shared'
import { moveDocUrl, moveRowOf } from '../../../../views/stock'
import type { CodeEvent, KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watch, pullToRefresh } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { buttonsOf, canDo, type ButtonView } from '../../../../core/actions'

// 底栏（2026-10-06 第 4 批：操作只放底栏）：报损、出库在前两个，入库、修改花材收进「更多」；
// 只剩 1～2 个时直接进底栏，两个时左次右主
function materialButtonsOf(actions: Parameters<typeof buttonsOf>[0]): ButtonView[] {
  const views = buttonsOf(actions, [
    { code: 'reportLoss' },
    { code: 'stockOut' },
    { code: 'stockIn' },
    { code: 'edit' },
  ]).map((view) => (view.code === 'edit' ? { ...view, text: redesignCopy.editMaterial } : view))
  const bar = Math.min(views.length, 2)
  return views.map((view, index) => ({
    ...view,
    kind: index >= bar ? 'text' : index === bar - 1 ? 'primary' : 'secondary',
  }))
}
const RECENT_MOVES = 3
Page({
  ...pullToRefresh,
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.material,
    loaded: false,
    failure: null as FailureView | null,
    material: null as OutputOf<typeof contract.getMaterial> | null,
    head: { name: '', qty: '', unit: '', sub: '', disabled: false, disabledText: '' },
    buttons: [] as ButtonView[],
    recent: [] as ReturnType<typeof moveRowOf>[],
    batches: [] as { id: string; date: string; qty: string; age: string; aged: boolean }[],
    texts: {
      moves: copy.stock.screen.titles.moves,
      stock: copy.screen.title.stock,
      fifo: copy.screen.fifo,
      inDate: copy.screen.inDate,
      remaining: copy.screen.remaining,
      recent: copy.screen.recentMoves,
      allMoves: copy.screen.allOfThisFlower,
      noMoves: copy.stock.screen.empty.moves,
      batches: copy.screen.section.batches,
    },
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
    void this.loadRecent()
    watch(this, ['stock'], () => {
      void this.load()
      void this.loadRecent()
    })
  },
  async loadRecent() {
    const result = await request(contract.listStockMoves, {
      query: { materialId: this.id },
    })
    if (result.ok)
      this.setData({
        recent: result.data.items
          .slice(0, RECENT_MOVES)
          .map((move) => moveRowOf(move, { withName: true, date: true })),
      })
  },
  onOpen(event: KeyEvent) {
    const row = this.data.recent.find((item) => item.id === event.currentTarget.dataset.key)
    if (row) void wx.navigateTo({ url: moveDocUrl(row) })
  },
  async load() {
    const result = await request(contract.getMaterial, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, this.data.loaded ? 'refresh' : 'load') })
      return
    }
    const m = result.data
    this.setData({
      loaded: true,
      failure: null,
      material: m,
      buttons: materialButtonsOf(m.actions),
      head: {
        name: m.name,
        qty: String(m.stockQty),
        unit: m.unit,
        sub: [
          `${copy.field.code} ${m.code}`,
          `${copy.field.category} ${m.categoryName}`,
          `${copy.field.unit} ${m.unit}`,
        ].join(copy.separator),
        disabled: !m.enabled,
        disabledText: copy.statusValue.disabled,
      },
      batches: m.batches.map((b) => ({
        id: b.id,
        date: b.inDate,
        age: redesignCopy.age(b.ageDays),
        aged: b.ageDays >= STOCK_AGE_WARNING_DAYS,
        qty: formatQty(b.leftQty, m.unit),
      })),
    })
  },
  onMoves() {
    void wx.navigateTo({ url: `/packages/warehouse/pages/moves/index?materialId=${this.id}` })
  },
  onAction(event: CodeEvent) {
    const code = event.currentTarget.dataset.code
    const material = this.data.material
    if (!material || !canDo(material.actions, code as Parameters<typeof canDo>[1])) return
    if (code === 'edit') {
      void wx.navigateTo({ url: `/packages/warehouse/pages/materials/index?editId=${this.id}` })
      return
    }
    const kind = { stockOut: 'out', reportLoss: 'loss', stockIn: 'in' }[code]
    if (kind)
      void wx.navigateTo({
        url: `/packages/warehouse/pages/doc-form/index?kind=${kind}&materialId=${this.id}`,
      })
  },
  onFailureAction() {
    void this.load()
  },
})
