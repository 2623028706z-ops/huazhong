import {
  contract,
  copy,
  redesignCopy,
  STOCK_AGE_WARNING_DAYS,
  formatQty,
  type OutputOf,
} from '@huazhong/shared'
import { moveDocUrl, moveRowOf } from '../../../../views/stock'
import type { KeyEvent } from '../../../../core/events'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { canDo } from '../../../../core/actions'
const RECENT_MOVES = 3
Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.material,
    loaded: false,
    failure: null as FailureView | null,
    material: null as OutputOf<typeof contract.getMaterial> | null,
    head: { name: '', qty: '', unit: '', sub: '', disabled: false, disabledText: '', edit: '' },
    recent: [] as ReturnType<typeof moveRowOf>[],
    batches: [] as { id: string; date: string; qty: string; age: string; aged: boolean }[],
    canEdit: false,
    canStockIn: false,
    canStockOut: false,
    canLoss: false,
    texts: {
      loss: copy.stock.screen.titles.loss,
      stockOut: copy.stock.screen.stockOut,
      edit: redesignCopy.editMaterial,
      stockIn: copy.stock.screen.stockIn,
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
      canEdit: canDo(m.actions, 'edit'),
      canStockIn: canDo(m.actions, 'stockIn'),
      canStockOut: canDo(m.actions, 'stockOut'),
      canLoss: canDo(m.actions, 'reportLoss'),
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
        edit: canDo(m.actions, 'edit') ? redesignCopy.editMaterial : '',
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
  onEdit() {
    void wx.navigateTo({ url: `/packages/warehouse/pages/materials/index?editId=${this.id}` })
  },
  onMoves() {
    void wx.navigateTo({ url: `/packages/warehouse/pages/moves/index?materialId=${this.id}` })
  },
  onStockOut() {
    if (this.data.canStockOut)
      void wx.navigateTo({
        url: `/packages/warehouse/pages/doc-form/index?kind=out&materialId=${this.id}`,
      })
  },
  onLoss() {
    if (this.data.canLoss)
      void wx.navigateTo({
        url: `/packages/warehouse/pages/doc-form/index?kind=loss&materialId=${this.id}`,
      })
  },
  onStockIn() {
    if (this.data.canStockIn)
      void wx.navigateTo({
        url: `/packages/warehouse/pages/doc-form/index?kind=in&materialId=${this.id}`,
      })
  },
  onFailureAction() {
    void this.load()
  },
})
