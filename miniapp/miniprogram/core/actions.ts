// 操作按钮（00 章第 1 节、06 章第 1 节）：只按后端 actions 显示，页面不按状态推算。
// enabled 为 false 显示禁用并写 disabledReason；reasonRequired 决定原因弹层要不要原因框
import { copy, type Action, type ActionCode } from '@huazhong/shared'

const labels: Partial<Record<ActionCode, string>> = {
  stockIn: copy.stock.screen.stockIn,
  stockOut: copy.stock.screen.stockOut,
  void: copy.stock.screen.void,
  requestCancel: copy.rework.requestCancel,
  withdrawCancel: copy.rework.withdrawCancel,
  approveCancel: copy.rework.approveCancel,
  rejectCancel: copy.rework.rejectCancel,
  voidOrder: copy.rework.voidOrder,
  registerPayment: copy.screen.action.pay,
  allocatePrepaid: copy.rework.allocatePaymentPrepaid,
  refundReceipt: copy.rework.registerRefund,
  refundPayment: copy.rework.registerRefund,
  revokeAllocation: copy.rework.revokeAllocation,
  revokePaymentAllocation: copy.rework.revokeAllocation,
  voidRefund: copy.rework.voidRefund,
  voidPo: copy.rework.voidPurchaseOrder,
  copyCatalog: copy.rework.copyCatalog,
  supplierEditPo: copy.screen.action.editPo,
  supplierCancelPo: copy.screen.action.cancelPo,
}
function textOf(code: ActionCode): string {
  const existing: Partial<Record<ActionCode, string>> = copy.screen.action
  return labels[code] ?? existing[code] ?? code
}

export interface ButtonView {
  code: string
  text: string
  kind: 'primary' | 'secondary'
  disabled: boolean
  reason: string
}

export function findAction(actions: readonly Action[], code: ActionCode): Action | null {
  return actions.find((action) => action.code === code) ?? null
}

export function hasAction(actions: readonly Action[], code: ActionCode): boolean {
  return findAction(actions, code) !== null
}

// 在列表里而且能点
export function canDo(actions: readonly Action[], code: ActionCode): boolean {
  return findAction(actions, code)?.enabled === true
}

export function isReasonRequired(actions: readonly Action[], code: ActionCode): boolean {
  return findAction(actions, code)?.reasonRequired === true
}

interface ButtonSpec {
  code: ActionCode
  secondary?: boolean
}

// 底部操作区：按页面给的顺序（次在左、主在右），只放 actions 里有的
export function buttonsOf(actions: readonly Action[], specs: readonly ButtonSpec[]): ButtonView[] {
  const views: ButtonView[] = []
  for (const spec of specs) {
    const action = findAction(actions, spec.code)
    if (!action) continue
    views.push({
      code: spec.code,
      text: textOf(spec.code),
      kind: spec.secondary ? 'secondary' : 'primary',
      disabled: !action.enabled,
      reason: action.disabledReason ?? '',
    })
  }
  return views
}
