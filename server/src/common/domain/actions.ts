// actions 的写法（05 章第 1.5 节）：enabled 为 true 时 disabledReason 一定是 null
import { appError, type Action, type ActionCode } from '@huazhong/shared'

export function enabledAction(code: ActionCode, reasonRequired: boolean | null): Action {
  return { code, enabled: true, disabledReason: null, reasonRequired }
}

// disabledReason 为 null = 可点；否则显示禁用、下方写这句
export function actionOf(
  code: ActionCode,
  disabledReason: string | null,
  reasonRequired: boolean | null,
): Action {
  if (disabledReason === null) return enabledAction(code, reasonRequired)
  return { code, enabled: false, disabledReason, reasonRequired }
}

interface Gate {
  code: ActionCode
  // 写接口带来的版本号；新建类没有
  version?: number
  // 这张单现在没有这个操作时的一句话（状态已经变了）
  missing: string
  // 版本变了时的一句话
  stale: string
}

// 写接口的前置校验和 actions 用同一个判断（05 章第 1.5 节）：
// 没有这个操作：打开后被别人改了状态（版本变了）→ STALE（missing，带最新详情），否则 → BUSINESS_RULE（missing）；
// 有这个操作但版本变了 → STALE（stale）；显示禁用 → BUSINESS_RULE（disabledReason）
export function gateAction(
  detail: { version: number; actions: readonly Action[] },
  gate: Gate,
): Action {
  const action = detail.actions.find((item) => item.code === gate.code)
  const moved = gate.version !== undefined && gate.version !== detail.version
  if (!action) {
    if (moved) throw appError.stale(gate.missing, detail)
    throw appError.businessRule(gate.missing)
  }
  if (moved) throw appError.stale(gate.stale, detail)
  if (!action.enabled) throw appError.businessRule(action.disabledReason)
  return action
}

// 同一操作码只留第一个（多模块员工的 actions 是各模块的并集）
export function uniqueActions(actions: readonly Action[]): Action[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    if (seen.has(action.code)) return false
    seen.add(action.code)
    return true
  })
}
