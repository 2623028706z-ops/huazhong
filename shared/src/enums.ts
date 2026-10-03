// 枚举码：只在这里定义一次。数据库 pgEnum、接口契约、前端都取这里的值（04 章第 2 节）
// 中文名和状态颜色在 labels.ts

export const orderStatuses = [
  'pending_confirm',
  'to_ship',
  'shipped',
  'cancelled',
  'voided',
] as const
export const cancelRequestStatuses = [
  'pending',
  'withdrawn',
  'approved',
  'rejected',
  'lapsed',
] as const
export const refundKinds = ['receipt', 'payment'] as const
export const orderOrigins = ['store', 'sales'] as const
export const storeInviteStatuses = ['pending', 'used', 'expired', 'voided'] as const
export const afterStatuses = ['pending', 'processed', 'closed', 'voided'] as const
export const afterOrigins = ['store', 'sales'] as const
export const afterReasons = ['damaged', 'qty_mismatch', 'quality', 'other'] as const
export const recordStatuses = ['valid', 'voided'] as const
export const allocKinds = ['direct', 'prepaid'] as const
export const allocationStatuses = ['valid', 'revoked'] as const
export const inviteStatuses = ['pending', 'submitted', 'cancelled'] as const
export const poStatuses = ['to_receive', 'received', 'rejected', 'cancelled', 'voided'] as const
export const whDocKinds = ['in', 'out', 'loss'] as const
export const whDocStatuses = ['stocked_in', 'stocked_out', 'lost', 'voided'] as const
export const stocktakeStatuses = ['done'] as const
export const moveTypes = [
  'po_in',
  'po_return',
  'manual_in',
  'in_void',
  'out_void',
  'loss_void',
  'manual_out',
  'loss',
  'check_gain',
  'check_loss',
  // 阶段 5 追加：作废已收货采购单（enum 只能在末尾追加，04 章第 1 节）
  'po_void',
] as const
export const accountTypes = ['admin', 'staff', 'store', 'supplier'] as const
export const moduleKeys = ['sales', 'shipping', 'purchase', 'warehouse', 'finance'] as const
export const fileStatuses = ['pending', 'ok', 'rejected'] as const
export const filePurposes = ['after_image', 'product_image', 'loss_image'] as const
// 只有这些模块有待办接口（采购、仓库的待办在阶段 4、5 加）
export const todoModules = ['sales', 'shipping', 'purchase', 'warehouse', 'finance'] as const

// 查询时算出来、不存库的状态
export const payStatuses = ['unpaid', 'partial', 'paid'] as const
export const apStatuses = ['unpaid', 'partial', 'paid', 'no_pay'] as const

// 单号前缀（04 章第 1 节）
export const docPrefixes = [
  'SO',
  'AS',
  'PO',
  'YQ',
  'SK',
  'RK',
  'CK',
  'BS',
  'PD',
  'FK',
  'TK',
] as const

export type OrderStatus = (typeof orderStatuses)[number]
export type OrderOrigin = (typeof orderOrigins)[number]
export type AfterStatus = (typeof afterStatuses)[number]
export type AfterReason = (typeof afterReasons)[number]
export type PayStatus = (typeof payStatuses)[number]
export type RecordStatus = (typeof recordStatuses)[number]
export type AllocKind = (typeof allocKinds)[number]
export type AllocationStatus = (typeof allocationStatuses)[number]
export type FilePurpose = (typeof filePurposes)[number]
export type TodoModule = (typeof todoModules)[number]
export type AccountType = (typeof accountTypes)[number]
export type ModuleKey = (typeof moduleKeys)[number]
export type DocPrefix = (typeof docPrefixes)[number]
export type MoveType = (typeof moveTypes)[number]
export type WhDocKind = (typeof whDocKinds)[number]
