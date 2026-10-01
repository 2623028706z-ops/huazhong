// 操作按钮（00 章第 1 节、06 章第 1 节）：只按后端 actions 显示，页面不按状态推算。
// enabled 为 false 显示禁用并写 disabledReason；reasonRequired 决定原因弹层要不要原因框
import { copy, type Action, type ActionCode } from '@huazhong/shared'

type ButtonCode = keyof typeof copy.screen.action

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
  code: ActionCode & ButtonCode
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
      text: copy.screen.action[spec.code],
      kind: spec.secondary ? 'secondary' : 'primary',
      disabled: !action.enabled,
      reason: action.disabledReason ?? '',
    })
  }
  return views
}
