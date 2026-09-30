// 当前账号：守卫按 openid 查出来的身份、归属、模块（纯函数，05 章第 1.2 节）
import {
  appError,
  copy,
  moduleKeys,
  type AccountType,
  type Grant,
  type ModuleKey,
} from '@huazhong/shared'

export interface Viewer {
  readonly accountId: number
  readonly type: AccountType
  readonly name: string
  readonly phone: string
  readonly modules: readonly ModuleKey[]
  readonly storeId: number | null
  readonly customerId: number | null
  readonly supplierId: number | null
  // 门店「客户 · 门店」、供应商名称；员工为 null
  readonly orgLabel: string | null
}

export interface AccountRow {
  accountId: number
  version: number
  type: AccountType
  name: string
  phone: string
  openid: string | null
  enabled: boolean
  modules: ModuleKey[]
  storeId: number | null
  storeName: string | null
  storeEnabled: boolean | null
  customerId: number | null
  customerName: string | null
  supplierId: number | null
  supplierName: string | null
  supplierEnabled: boolean | null
}

// 账号停用、门店停用、供应商停用都不能登录；客户停用不影响登录（03 章第 5 节）
function assertLoginAllowed(row: AccountRow): void {
  if (!row.enabled) throw appError.accountDisabled()
  if (row.type === 'store' && row.storeEnabled !== true) {
    throw appError.accountDisabled(copy.error.storeDisabled)
  }
  if (row.type === 'supplier' && row.supplierEnabled !== true) {
    throw appError.accountDisabled(copy.error.supplierDisabled)
  }
}

function modulesOf(row: AccountRow): readonly ModuleKey[] {
  if (row.type === 'admin') return moduleKeys
  if (row.type === 'staff') return moduleKeys.filter((key) => row.modules.includes(key))
  return []
}

function orgLabelOf(row: AccountRow): string | null {
  if (row.type === 'store' && row.customerName !== null && row.storeName !== null) {
    return copy.org.store(row.customerName, row.storeName)
  }
  if (row.type === 'supplier') return row.supplierName
  return null
}

export function resolveViewer(row: AccountRow | undefined): Viewer {
  if (!row) throw appError.unauthenticated()
  assertLoginAllowed(row)
  return viewerOf(row)
}

// 不做停用检查：退出登录（停用的账号也能退出）写日志操作人时用
export function viewerOf(row: AccountRow): Viewer {
  return {
    accountId: row.accountId,
    type: row.type,
    name: row.name,
    phone: row.phone,
    modules: modulesOf(row),
    storeId: row.storeId,
    customerId: row.customerId,
    supplierId: row.supplierId,
    orgLabel: orgLabelOf(row),
  }
}

function grantMatches(viewer: Viewer, grant: Grant): boolean {
  switch (grant) {
    case 'admin':
      return viewer.type === 'admin'
    case 'staff':
      return viewer.type === 'admin' || viewer.type === 'staff'
    case 'store':
      return viewer.type === 'store'
    case 'supplier':
      return viewer.type === 'supplier'
    default:
      // 模块码：有这个模块的员工；管理员的 modules 是全部模块
      return viewer.modules.includes(grant)
  }
}

// 守卫第一层：契约里的「允许角色」（05 章第 1.2 节）；'openid' 的接口不查账号，不走这里
export function isGranted(viewer: Viewer, grants: 'any' | readonly Grant[]): boolean {
  return grants === 'any' || grants.some((grant) => grantMatches(viewer, grant))
}

// 日志、变更记录里的操作人快照（04 章第 3.3 节）
export function actorLabelOf(viewer: Viewer | null): string {
  if (!viewer) return copy.actor.system
  if (viewer.orgLabel === null) return viewer.name
  return copy.actor.external(viewer.name, viewer.orgLabel)
}
