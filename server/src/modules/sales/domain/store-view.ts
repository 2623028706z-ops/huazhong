// 客户、门店列表项和门店账号的变更（纯函数，03 章第 8.1 节、05 章第 1.5 节）
import { copy, type Action, type CustomerItem, type StoreItem } from '@huazhong/shared'
import { actionOf } from '../../../common/domain/actions.ts'

export interface StoreRow {
  id: number
  version: number
  customerId: number
  name: string
  contact: string
  phone: string
  address: string
  enabled: boolean
  // 启用的门店账号；没开通为 null
  accountId: number | null
  accountVersion: number | null
  loginPhone: string | null
  bound: boolean
}

// 门店资料里的「邀请下单」「解绑微信」：只有销售（管理员含全部模块）
function storeActionsOf(row: StoreRow, isSales: boolean): Action[] {
  if (!isSales) return []
  const actions: Action[] = []
  if (row.enabled) {
    let blocked: string | null = null
    if (row.loginPhone === null) blocked = copy.catalog.loginPhoneMissing
    else if (row.bound) blocked = copy.catalog.storeBound
    actions.push(actionOf('inviteStore', blocked, null))
  }
  if (row.bound) actions.push(actionOf('unbindStoreWechat', null, false))
  return actions
}

export function toStoreItem(row: StoreRow, isSales: boolean): StoreItem {
  return {
    id: String(row.id),
    version: row.version,
    customerId: String(row.customerId),
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    address: row.address,
    enabled: row.enabled,
    loginPhone: row.loginPhone,
    accountVersion: row.accountVersion,
    actions: storeActionsOf(row, isSales),
  }
}

export function toCustomerItem(
  row: { id: number; version: number; name: string; enabled: boolean },
  stores: readonly StoreRow[],
  isSales: boolean,
): CustomerItem {
  return {
    id: String(row.id),
    version: row.version,
    name: row.name,
    enabled: row.enabled,
    stores: stores.map((store) => toStoreItem(store, isSales)),
  }
}

export interface StoreState {
  name: string
  contact: string
  phone: string
  address: string
  enabled: boolean
  loginPhone: string
}

export function storeStateOf(row: StoreRow): StoreState {
  return {
    name: row.name,
    contact: row.contact,
    phone: row.phone,
    address: row.address,
    enabled: row.enabled,
    loginPhone: row.loginPhone ?? '',
  }
}

export function storeLogView(state: StoreState): Record<string, string> {
  return {
    [copy.field.name]: state.name,
    [copy.field.contact]: state.contact,
    [copy.field.storePhone]: state.phone,
    [copy.field.address]: state.address,
    [copy.field.phone]: state.loginPhone,
    [copy.field.status]: state.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}

// 门店账号怎么跟着改：填了登录手机号就开通或更新（名字 = 联系人），清空就停用；改了手机号同时解绑微信
export type AccountPlan =
  { kind: 'none' } | { kind: 'create' } | { kind: 'update'; unbind: boolean } | { kind: 'disable' }

export function accountPlanOf(
  before: StoreState,
  next: StoreState,
  hasAccount: boolean,
): AccountPlan {
  if (!hasAccount) return next.loginPhone === '' ? { kind: 'none' } : { kind: 'create' }
  if (next.loginPhone === '') return { kind: 'disable' }
  const phoneChanged = before.loginPhone !== next.loginPhone
  if (!phoneChanged && before.contact === next.contact) return { kind: 'none' }
  return { kind: 'update', unbind: phoneChanged }
}
