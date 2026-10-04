// 枚举码的中文名和状态标签颜色：只在这里定义（02 章第 2 节、04 章第 2 节）
import { copy } from './copy.ts'
import type {
  accountTypes,
  afterOrigins,
  afterReasons,
  afterStatuses,
  cancelRequestStatuses,
  refundKinds,
  fileStatuses,
  inviteStatuses,
  moduleKeys,
  moveTypes,
  orderOrigins,
  orderStatuses,
  poStatuses,
  recordStatuses,
  statementStatuses,
  stocktakeStatuses,
  storeInviteStatuses,
  whDocKinds,
  whDocStatuses,
} from './enums.ts'

type Labels<T extends readonly string[]> = Record<T[number], string>

export const labels = {
  statementStatus: { unsettled: '未结清', settled: '已结清', voided: '已作废' } satisfies Labels<
    typeof statementStatuses
  >,

  cancelRequestStatus: {
    pending: '待处理',
    withdrawn: '已撤回',
    approved: '已同意',
    rejected: '已拒绝',
    lapsed: '已失效',
  } satisfies Labels<typeof cancelRequestStatuses>,
  refundKind: { receipt: '多收退回', payment: '多付退回' } satisfies Labels<typeof refundKinds>,
  orderStatus: {
    pending_confirm: '待确认',
    to_ship: '待发货',
    shipped: '已发货',
    cancelled: '已取消',
    voided: '已作废',
  } satisfies Labels<typeof orderStatuses>,
  orderOrigin: { store: '门店下单', sales: '销售新建' } satisfies Labels<typeof orderOrigins>,
  storeInviteStatus: {
    pending: '待使用',
    used: '已使用',
    expired: '已过期',
    voided: '已作废',
  } satisfies Labels<typeof storeInviteStatuses>,
  afterStatus: {
    pending: '待处理',
    processed: '已处理',
    closed: '已关闭',
    voided: '已作废',
  } satisfies Labels<typeof afterStatuses>,
  afterOrigin: { store: '门店提交', sales: '销售新建' } satisfies Labels<typeof afterOrigins>,
  afterReason: {
    damaged: '花材损坏',
    qty_mismatch: '数量不符',
    quality: '品质问题',
    other: '其他',
  } satisfies Labels<typeof afterReasons>,
  recordStatus: { valid: '有效', voided: '已作废' } satisfies Labels<typeof recordStatuses>,
  inviteStatus: {
    pending: '待填报',
    submitted: '已提交',
    cancelled: '已取消',
  } satisfies Labels<typeof inviteStatuses>,
  poStatus: {
    to_receive: '待收货',
    received: '已收货',
    rejected: '已拒收',
    cancelled: '已取消',
    voided: '已作废',
  } satisfies Labels<typeof poStatuses>,
  whDocKind: { in: '手工入库', out: '手工出库', loss: '报损' } satisfies Labels<typeof whDocKinds>,
  whDocStatus: {
    stocked_in: '已入库',
    stocked_out: '已出库',
    lost: '已报损',
    voided: '已作废',
  } satisfies Labels<typeof whDocStatuses>,
  stocktakeStatus: { done: '已盘点' } satisfies Labels<typeof stocktakeStatuses>,
  moveType: {
    po_in: '采购入库',
    po_return: '采购退货',
    manual_in: '手工入库',
    in_void: '入库作废',
    out_void: '出库作废',
    loss_void: '报损作废',
    manual_out: '手工出库',
    loss: '报损',
    check_gain: '盘点盘盈',
    check_loss: '盘点盘亏',
    po_void: '采购单作废',
  } satisfies Labels<typeof moveTypes>,
  accountType: {
    admin: '管理员',
    staff: '员工',
    store: '门店',
    supplier: '供应商',
  } satisfies Labels<typeof accountTypes>,
  module: {
    sales: '销售',
    shipping: '发货',
    purchase: '采购',
    warehouse: '仓库',
    finance: '财务',
  } satisfies Labels<typeof moduleKeys>,
  fileStatus: { pending: '待检测', ok: '通过', rejected: '不通过' } satisfies Labels<
    typeof fileStatuses
  >,
} as const

// 岗位：管理员写「管理员」，员工写模块名，多个用「、」连（03 章第 8.5 节）；身份行和员工列表共用
export function roleLabelOf(account: {
  admin: boolean
  modules: readonly (typeof moduleKeys)[number][]
}): string {
  if (account.admin) return labels.accountType.admin
  return account.modules.map((key) => labels.module[key]).join(copy.staff.roleSeparator)
}

// 状态标签三类颜色（02 章第 2 节）：done 绿、ended 灰、wait 琥珀
export type StatusTone = 'done' | 'ended' | 'wait'

type Tones<T extends readonly string[]> = Record<T[number], StatusTone>

// hz-status 传「状态种类 + 状态码」取中文名和颜色；种类名和 labels 的键一致
export const statusTones = {
  statementStatus: { unsettled: 'wait', settled: 'done', voided: 'ended' } satisfies Tones<
    typeof statementStatuses
  >,
  cancelRequestStatus: {
    pending: 'wait',
    withdrawn: 'ended',
    approved: 'done',
    rejected: 'ended',
    lapsed: 'ended',
  } satisfies Tones<typeof cancelRequestStatuses>,
  orderStatus: {
    pending_confirm: 'wait',
    to_ship: 'wait',
    shipped: 'done',
    cancelled: 'ended',
    voided: 'ended',
  } satisfies Tones<typeof orderStatuses>,
  storeInviteStatus: {
    pending: 'wait',
    used: 'done',
    expired: 'ended',
    voided: 'ended',
  } satisfies Tones<typeof storeInviteStatuses>,
  afterStatus: {
    pending: 'wait',
    processed: 'done',
    closed: 'ended',
    voided: 'ended',
  } satisfies Tones<typeof afterStatuses>,
  recordStatus: { valid: 'done', voided: 'ended' } satisfies Tones<typeof recordStatuses>,
  inviteStatus: {
    pending: 'wait',
    submitted: 'done',
    cancelled: 'ended',
  } satisfies Tones<typeof inviteStatuses>,
  poStatus: {
    to_receive: 'wait',
    received: 'done',
    rejected: 'ended',
    cancelled: 'ended',
    voided: 'ended',
  } satisfies Tones<typeof poStatuses>,
  whDocStatus: {
    stocked_in: 'done',
    stocked_out: 'done',
    lost: 'done',
    voided: 'ended',
  } satisfies Tones<typeof whDocStatuses>,
  stocktakeStatus: { done: 'done' } satisfies Tones<typeof stocktakeStatuses>,
} as const
export type StatusKind = keyof typeof statusTones

// 某种状态里的等待类状态码：列表 counts 只数这些（05 章第 1.3 节）
export function waitCodesOf<K extends StatusKind>(kind: K): (keyof (typeof statusTones)[K])[] {
  const tones: Record<string, StatusTone> = statusTones[kind]
  return Object.keys(tones).filter(
    (code) => tones[code] === 'wait',
  ) as (keyof (typeof statusTones)[K])[]
}

// 状态码 → 中文名和颜色（hz-status、筛选栏状态标签共用）；种类或状态码不对返回 null
export function statusOf(kind: string, code: string): { text: string; tone: StatusTone } | null {
  if (!Object.prototype.hasOwnProperty.call(statusTones, kind)) return null
  const tones: Record<string, StatusTone> = statusTones[kind as StatusKind]
  const names: Record<string, string> = labels[kind as StatusKind]
  const tone = tones[code]
  const text = names[code]
  return tone && text ? { text, tone } : null
}
