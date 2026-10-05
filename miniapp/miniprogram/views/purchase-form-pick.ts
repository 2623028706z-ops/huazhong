// 采购单、询价单表单的「添加花材」弹层（views/pick）：选的时候填好数量，确认后按数量加入，不再打开小窗口
import { materialPickOf, pickChosen, pickHandlers, pickOpen } from './pick'
import { purchaseLineOf } from './purchase-form-data'
import type { PurchaseFormHost as Host } from './purchase-form'

export const purchaseFormPick = {
  onOpenPick(this: Host) {
    const added = new Set(this.data.form.lines.map((l) => l.id))
    this.setData({
      pickSheet: true,
      ...pickOpen(this.materials.filter((m) => !added.has(m.id)).map((m) => materialPickOf(m))),
    })
  },
  onClosePick(this: Host) {
    this.setData({ pickSheet: false })
  },
  ...pickHandlers,
  onPickConfirm(this: Host) {
    const added = pickChosen(this.data).flatMap(({ id, qty }) => {
      const material = this.materials.find((m) => m.id === id)
      return material ? [purchaseLineOf(material, qty)] : []
    })
    this.setData({ pickSheet: false })
    if (added.length) this.update({ lines: [...this.data.form.lines, ...added] })
  },
}
