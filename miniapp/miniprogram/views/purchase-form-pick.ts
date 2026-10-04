// 采购单 / 填报单「添加花材」多选（06 章 P7 / C9）：弹层里勾多个，底部「添加（n）」一次加入
import type { KeyEvent } from '../core/events'
import { pickOpen, pickPatch, toggled } from './pick'
import { materialPickOf } from './purchase'
import { purchaseLineOf } from './purchase-form-data'
import type { PurchaseFormHost as Host } from './purchase-form'

export const purchaseFormPick = {
  onOpenPick(this: Host) {
    const added = new Set(this.data.form.lines.map((l) => l.id))
    this.setData({
      editKey: '',
      pickSheet: true,
      ...pickOpen(this.materials.filter((m) => !added.has(m.id)).map(materialPickOf)),
    })
  },
  onClosePick(this: Host) {
    this.setData({ pickSheet: false })
  },
  onPick(this: Host, event: KeyEvent) {
    this.setData(
      pickPatch(this.data.picks, toggled(this.data.pickIds, event.currentTarget.dataset.key)),
    )
  },
  // 勾选的花材一次加入，数量默认同单项添加
  onPickConfirm(this: Host) {
    const added = this.data.pickIds.flatMap((id) => {
      const material = this.materials.find((m) => m.id === id)
      return material ? [purchaseLineOf(material)] : []
    })
    this.setData({ pickSheet: false })
    if (!added.length) return
    this.update({ lines: [...this.data.form.lines, ...added] })
    this.setData({ editKey: this.data.pickIds[this.data.pickIds.length - 1] ?? '' })
  },
}
