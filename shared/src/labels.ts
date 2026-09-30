// 枚举码的中文名和状态标签颜色：只在这里定义（02 章第 2 节、04 章第 2 节）
import { copy } from './copy.ts'
import type {
  accountTypes,
  afterOrigins,
  afterReasons,
  afterStatuses,
  allocKinds,
  apStatuses,
  fileStatuses,
  inviteStatuses,
  methodKinds,
  moduleKeys,
  moveTypes,
  orderOrigins,
  orderStatuses,
  payStatuses,
  poStatuses,
  recordStatuses,
  stocktakeStatuses,
  storeInviteStatuses,
  whDocKinds,
  whDocStatuses,
} from './enums.ts'

type Labels<T extends readonly string[]> = Record<T[number], string>

export const labels = {
  orderStatus: {
    pending_confirm: '待确认',
    to_ship: '待发货',
    shipped: '已发货',
    cancelled: '已取消',
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
  allocKind: { receipt: '收款', prepaid: '预收核销' } satisfies Labels<typeof allocKinds>,
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
    manual_out: '手工出库',
    loss: '报损',
    check_gain: '盘点盘盈',
    check_loss: '盘点盘亏',
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
  methodKind: { receive: '收款方式', pay: '付款方式' } satisfies Labels<typeof methodKinds>,
  fileStatus: { pending: '待检测', ok: '通过', rejected: '不通过' } satisfies Labels<
    typeof fileStatuses
  >,
  payStatus: { unpaid: '未收', partial: '部分收', paid: '已收' } satisfies Labels<
    typeof payStatuses
  >,
  // 门店端对同一个收款状态的叫法（03 章第 3 节）
  storePayStatus: { unpaid: '未付', partial: '部分付', paid: '已付' } satisfies Labels<
    typeof payStatuses
  >,
  apStatus: { to_pay: '待付款', paid: '已付款', no_pay: '无需付款' } satisfies Labels<
    typeof apStatuses
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
  orderStatus: {
    pending_confirm: 'wait',
    to_ship: 'wait',
    shipped: 'done',
    cancelled: 'ended',
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
  } satisfies Tones<typeof poStatuses>,
  whDocStatus: {
    stocked_in: 'done',
    stocked_out: 'done',
    lost: 'done',
    voided: 'ended',
  } satisfies Tones<typeof whDocStatuses>,
  stocktakeStatus: { done: 'done' } satisfies Tones<typeof stocktakeStatuses>,
  payStatus: { unpaid: 'wait', partial: 'wait', paid: 'done' } satisfies Tones<typeof payStatuses>,
  storePayStatus: { unpaid: 'wait', partial: 'wait', paid: 'done' } satisfies Tones<
    typeof payStatuses
  >,
  apStatus: { to_pay: 'wait', paid: 'done', no_pay: 'ended' } satisfies Tones<typeof apStatuses>,
} as const
export type StatusKind = keyof typeof statusTones

// 状态码 → 中文名和颜色（hz-status、筛选栏状态标签共用）；种类或状态码不对返回 null
export function statusOf(kind: string, code: string): { text: string; tone: StatusTone } | null {
  if (!Object.prototype.hasOwnProperty.call(statusTones, kind)) return null
  const tones: Record<string, StatusTone> = statusTones[kind as StatusKind]
  const names: Record<string, string> = labels[kind as StatusKind]
  const tone = tones[code]
  const text = names[code]
  return tone && text ? { text, tone } : null
}
