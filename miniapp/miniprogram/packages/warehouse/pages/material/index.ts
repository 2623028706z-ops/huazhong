import {
  contract,
  copy,
  redesignCopy,
  STOCK_AGE_WARNING_DAYS,
  formatQty,
  type OutputOf,
} from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { canDo } from '../../../../core/actions'
Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.material,
    loaded: false,
    failure: null as FailureView | null,
    material: null as OutputOf<typeof contract.getMaterial> | null,
    rows: [] as { label: string; value: string }[],
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
      batches: copy.screen.section.batches,
    },
  },
  id: '',
  onLoad(query: Record<string, string | undefined>) {
    this.id = query.id ?? ''
  },
  onShow() {
    void this.load()
    watch(this, ['stock'], () => void this.load())
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
      rows: [
        { label: copy.field.code, value: m.code },
        { label: copy.field.category, value: m.categoryName },
        { label: copy.field.unit, value: m.unit },
        {
          label: copy.field.status,
          value: m.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
        },
        { label: copy.screen.title.stock, value: formatQty(m.stockQty, m.unit) },
      ],
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
