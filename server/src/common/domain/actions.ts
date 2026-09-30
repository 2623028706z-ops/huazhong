// actions 的写法（05 章第 1.5 节）：enabled 为 true 时 disabledReason 一定是 null
import type { Action, ActionCode } from '@huazhong/shared'

export function enabledAction(code: ActionCode, reasonRequired: boolean | null): Action {
  return { code, enabled: true, disabledReason: null, reasonRequired }
}
