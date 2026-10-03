import { contract, copy, formatQty, type OutputOf } from '@huazhong/shared'
import type { FailureView } from '../../../../core/failure-view'
import { unwatchOnLeave, watch } from '../../../../core/live'
import { request } from '../../../../core/request'
import { failureOf } from '../../../../core/session'
import { buttonsOf, canDo } from '../../../../core/actions'
import type { CodeEvent } from '../../../../core/events'
Page({
  ...unwatchOnLeave,
  data: {
    title: copy.screen.title.material,
    loaded: false,
    failure: null as FailureView | null,
    material: null as OutputOf<typeof contract.getMaterial> | null,
    rows: [] as { label: string; value: string }[],
    batches: [] as { id: string; date: string; qty: string }[],
    buttons: [] as ReturnType<typeof buttonsOf>,
    texts: { stock: copy.screen.title.stock, batches: copy.screen.section.batches },
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
      buttons: buttonsOf(m.actions, [{ code: 'stockIn', secondary: true }, { code: 'stockOut' }]),
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
        qty: formatQty(b.leftQty, m.unit),
      })),
    })
  },
  onFailureAction() {
    void this.load()
  },
  onAction(event: CodeEvent) {
    const code = event.currentTarget.dataset.code
    if (
      (code !== 'stockIn' && code !== 'stockOut') ||
      !this.data.material ||
      !canDo(this.data.material.actions, code)
    )
      return
    void wx.navigateTo({
      url: `/packages/warehouse/pages/doc-form/index?kind=${code === 'stockIn' ? 'in' : 'out'}&materialId=${this.id}`,
    })
  },
})
