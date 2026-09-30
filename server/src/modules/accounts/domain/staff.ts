// 员工与岗位的纯函数（03 章第 8.5 节、05 章第 3 节）：列表项、日志视图、有没有改、要不要解绑
import {
  copy,
  moduleKeys,
  roleLabelOf,
  type ModuleKey,
  type StaffItem,
  type StaffUpdate,
} from '@huazhong/shared'
import { enabledAction } from '../../../common/domain/actions.ts'
import type { AccountRow } from '../../../common/domain/viewer.ts'

// 员工列表和详情用到的账号字段
export type StaffRow = Pick<
  AccountRow,
  'accountId' | 'version' | 'type' | 'name' | 'phone' | 'openid' | 'enabled' | 'modules'
>

export interface StaffState {
  name: string
  phone: string
  admin: boolean
  modules: readonly ModuleKey[]
  enabled: boolean
}

// 模块按固定顺序；管理员不存模块（默认全部）
function orderedModules(modules: readonly ModuleKey[]): ModuleKey[] {
  return moduleKeys.filter((key) => modules.includes(key))
}

export function stateOf(row: StaffRow): StaffState {
  const admin = row.type === 'admin'
  return {
    name: row.name,
    phone: row.phone,
    admin,
    modules: admin ? [] : orderedModules(row.modules),
    enabled: row.enabled,
  }
}

export function nextStateOf(input: StaffUpdate): StaffState {
  return {
    name: input.name,
    phone: input.phone,
    admin: input.admin,
    modules: input.admin ? [] : orderedModules(input.modules),
    enabled: input.enabled,
  }
}

export function toStaffItem(row: StaffRow): StaffItem {
  return {
    id: String(row.accountId),
    version: row.version,
    ...stateOf(row),
    modules: [...stateOf(row).modules],
    actions: row.openid === null ? [] : [enabledAction('unbindStaffWechat', false)],
  }
}

export function isSameState(a: StaffState, b: StaffState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// 改了手机号或停用：原来绑定的微信自动解绑（2026-10-03 确认）
export function needsUnbind(before: StaffState, next: StaffState, isBound: boolean): boolean {
  return isBound && (before.phone !== next.phone || (before.enabled && !next.enabled))
}

// 管理员被降级或停用：要确认还有别的启用管理员
export function losesAdmin(before: StaffState, next: StaffState): boolean {
  return before.admin && before.enabled && !(next.admin && next.enabled)
}

// 日志里的修改前后：字段中文名 → 显示值
export function staffView(state: StaffState): Record<string, string> {
  return {
    [copy.field.name]: state.name,
    [copy.field.phone]: state.phone,
    [copy.field.role]: roleLabelOf(state),
    [copy.field.status]: state.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}
