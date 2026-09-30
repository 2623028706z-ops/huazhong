// 实时推送的权限（05 章第 12.2、12.4 节）：订阅时按角色和归属检查主题，推送时再按 scope 过滤
import type { ModuleKey, Topic } from '@huazhong/shared'
import type { ChangeScope } from '../../common/changes.ts'
import type { Viewer } from '../../common/domain/viewer.ts'

interface ParsedTopic {
  kind: string
  key: string | null
}

// order:12 → { order, 12 }；payable:po:5 → { payable, 5 }；orders → { orders, null }
function parseTopic(topic: Topic): ParsedTopic {
  const parts = topic.split(':')
  return { kind: parts[0] ?? topic, key: parts.length > 1 ? (parts.at(-1) ?? null) : null }
}

// 员工按模块能订阅的主题（管理员的 modules 是全部模块）
const staffModules: Partial<Record<string, readonly ModuleKey[]>> = {
  order: ['sales', 'shipping', 'finance'],
  orders: ['sales', 'shipping', 'finance'],
  after: ['sales', 'finance'],
  afters: ['sales', 'finance'],
  po: ['purchase', 'warehouse', 'finance'],
  pos: ['purchase', 'warehouse', 'finance'],
  invite: ['purchase'],
  invites: ['purchase'],
  wh_doc: ['warehouse', 'finance'],
  wh_docs: ['warehouse', 'finance'],
  receipt: ['finance'],
  payable: ['finance'],
  ar: ['finance'],
  ap: ['finance'],
  catalog: ['sales'],
  demand: ['purchase'],
  store_invites: ['sales'],
}

// 门店、供应商能订阅，但只收 scope 里含本店、本家的
const STORE_SCOPED = new Set(['order', 'orders', 'after', 'afters'])
const SUPPLIER_SCOPED = new Set(['po', 'pos', 'invite', 'invites'])

function staffCanSubscribe(viewer: Viewer, { kind, key }: ParsedTopic): boolean {
  if (kind === 'stock') return true
  if (kind === 'todo') return key === '*' || viewer.modules.some((module) => module === key)
  return (staffModules[kind] ?? []).some((module) => viewer.modules.includes(module))
}

function storeCanSubscribe(viewer: Viewer, { kind, key }: ParsedTopic): boolean {
  if (STORE_SCOPED.has(kind)) return true
  if (kind === 'ar' || kind === 'catalog') return key === String(viewer.customerId)
  return false
}

function supplierCanSubscribe(viewer: Viewer, { kind, key }: ParsedTopic): boolean {
  if (SUPPLIER_SCOPED.has(kind)) return true
  if (kind === 'ap' || kind === 'supplier') return key === String(viewer.supplierId)
  return false
}

export function canSubscribe(viewer: Viewer, topic: Topic): boolean {
  const parsed = parseTopic(topic)
  if (parsed.kind === 'account') return parsed.key === String(viewer.accountId)
  if (viewer.type === 'store') return storeCanSubscribe(viewer, parsed)
  if (viewer.type === 'supplier') return supplierCanSubscribe(viewer, parsed)
  return staffCanSubscribe(viewer, parsed)
}

// topic 是具体主题（不是通配）。门店的客户对账只收本店相关的（05 章第 5 节）；
// 没有仓库模块的财务只收带供应商的手工入库单
export function canDeliver(viewer: Viewer, topic: Topic, scope: ChangeScope): boolean {
  if (!canSubscribe(viewer, topic)) return false
  const { kind } = parseTopic(topic)
  if (viewer.type === 'store' && (STORE_SCOPED.has(kind) || kind === 'ar')) {
    return scope.storeIds.includes(String(viewer.storeId))
  }
  if (viewer.type === 'supplier' && SUPPLIER_SCOPED.has(kind)) {
    return scope.supplierIds.includes(String(viewer.supplierId))
  }
  if (kind.startsWith('wh_doc') && !viewer.modules.includes('warehouse'))
    return scope.supplierIds.length > 0
  return true
}

// 订阅的主题是否包含这条变更：相同，或同类通配（待办、应收、应付三类，主题以 :* 结尾）
export function covers(subscription: Topic, topic: Topic): boolean {
  return (
    subscription === topic ||
    (subscription.endsWith(':*') && topic.startsWith(subscription.slice(0, -1)))
  )
}
