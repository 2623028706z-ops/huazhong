import { contract, copy, labels } from '@huazhong/shared'
import { canDo } from '../core/actions'
import { request } from '../core/request'
import { failureOf } from '../core/session'
import { poViewOf } from './purchase'
import { inviteViewOf, openInvitePo } from './invite-detail'
import { poFormOf, inviteFormOf } from './purchase-form-data'
import type { PurchaseFormHost as Host } from './purchase-form'

export const purchaseFormDetails = {
  async loadDetail(this: Host, preserve = false) {
    return this.data.mode === 'po' ? this.loadPo(preserve) : this.loadInvite(preserve)
  },
  // 用户点实时提示条才换成最新内容，丢弃本地草稿（02 章第 5 节）
  onRealtime(this: Host) {
    void this.load(false)
  },
  onFailureAction(this: Host) {
    void this.load()
  },
  onPo(this: Host) {
    openInvitePo(this.invite, this.data.mode === 'supply')
  },
  async loadPo(this: Host, preserve: boolean) {
    const result = await request(
      this.data.supplierEditing ? contract.supplierPurchaseOrder : contract.getPurchaseOrder,
      { params: { id: this.id } },
    )
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    const editable = canDo(
      result.data.actions,
      this.data.supplierEditing ? 'supplierEditPo' : 'editPo',
    )
    this.setData({
      supplierName: result.data.supplierName,
      canChangeSupplier: !this.data.supplierEditing && canDo(result.data.actions, 'changeSupplier'),
      editable,
      lockedReason: result.data.lockedReason ?? labels.poStatus[result.data.status],
      poView: poViewOf(result.data, this.data.supplierEditing),
    })
    if (preserve && editable) {
      if (this.po?.version !== result.data.version)
        this.setData({ realtime: copy.screen.realtime.editing })
      this.po = result.data
      return true
    }
    this.po = result.data
    this.render(poFormOf(result.data, this.data.form.reason), true)
    return true
  },
  async loadInvite(this: Host, preserve: boolean) {
    const endpoint = this.data.mode === 'supply' ? contract.supplierInvite : contract.getInvite
    const result = await request(endpoint, { params: { id: this.id } })
    if (!result.ok) {
      this.setData({ failure: failureOf(result.failure, 'load') })
      return false
    }
    const editable = canDo(
      result.data.actions,
      this.data.mode === 'supply' ? 'submitSupply' : 'editInvite',
    )
    if (preserve && editable) {
      if (this.invite?.version !== result.data.version)
        this.setData({
          realtime:
            this.data.mode === 'supply' ? copy.screen.supplyEdited : copy.screen.realtime.editing,
        })
      if (this.data.mode === 'supply') {
        const enabled = new Set(this.materials.map((material) => material.id))
        this.render({
          ...this.data.form,
          lines: this.data.form.lines.map((line) => ({ ...line, enabled: enabled.has(line.id) })),
        })
      }
      this.invite = result.data
      return true
    }
    this.invite = result.data
    this.setData({
      supplierName: result.data.supplierName,
      canChangeSupplier: false,
      editable,
      inviteView: inviteViewOf(result.data, this.data.mode === 'supply'),
    })
    this.render(inviteFormOf(result.data), true)
    return true
  },
}
