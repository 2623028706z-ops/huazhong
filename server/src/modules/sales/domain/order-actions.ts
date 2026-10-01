// 订单的 actions 和 lockedReason（05 章第 1.5 节）：按账号角色 + 单据当前状态算，纯函数
import { addDays, AFTER_APPLY_DAYS, copy, type Action, type OrderStatus } from '@huazhong/shared'
import { actionOf } from '../../../common/domain/actions.ts'
import type { Viewer } from '../../../common/domain/viewer.ts'

export interface OrderFacts {
  status: OrderStatus
  storeEnabled: boolean
  customerEnabled: boolean
  // 单里已停用的产品名
  discontinued: readonly string[]
  shipDate: string | null
  // 实际发货那天（上海日期）；没发货为 null
  shippedDay: string | null
  // 至少一行可申请售后数量 > 0
  claimable: boolean
}

export interface OrderRoles {
  store: boolean
  sales: boolean
  shipping: boolean
}

export interface ActionSet {
  actions: Action[]
  lockedReason: string | null
}

const NONE: ActionSet = { actions: [], lockedReason: null }

export function rolesOf(viewer: Viewer): OrderRoles {
  return {
    store: viewer.type === 'store',
    sales: viewer.modules.includes('sales'),
    shipping: viewer.modules.includes('shipping'),
  }
}

// 门店售后申请期限：实际发货那天再加 AFTER_APPLY_DAYS 天，最后一天当天结束前都能申请（阶段 3 确认）
function withinAfterWindow(shippedDay: string | null, today: string): boolean {
  return shippedDay !== null && addDays(shippedDay, AFTER_APPLY_DAYS) >= today
}

// 门店售后申请期限的最后一天早于这天的已过期：SQL 按「实际发货日 ≥ 今天 − N 天」筛
export function afterWindowStart(today: string): string {
  return addDays(today, -AFTER_APPLY_DAYS)
}

export function namesText(names: readonly string[]): string {
  return names.join(copy.order.nameSeparator)
}

function afterActions(
  code: 'applyAfter' | 'createAfter',
  facts: OrderFacts,
  disabledReason: string | null,
): ActionSet {
  if (!facts.claimable) return { actions: [], lockedReason: copy.order.allAftered }
  return { actions: [actionOf(code, disabledReason, null)], lockedReason: null }
}

function storeActions(facts: OrderFacts, today: string): ActionSet {
  switch (facts.status) {
    case 'pending_confirm': {
      const editBlocked = facts.customerEnabled ? null : copy.store.customerDisabledEdit
      return {
        actions: [actionOf('storeCancel', null, false), actionOf('storeEdit', editBlocked, false)],
        lockedReason: null,
      }
    }
    case 'to_ship':
      return { actions: [], lockedReason: copy.order.confirmedLocked }
    case 'shipped': {
      const expired = withinAfterWindow(facts.shippedDay, today) ? null : copy.order.afterExpired
      return afterActions('applyAfter', facts, expired)
    }
    case 'cancelled':
      return NONE
  }
}

// 确认订单、修改并确认的禁用原因：门店停用 → 客户停用（05 章第 1.5 节）
function confirmBlock(facts: OrderFacts): string | null {
  if (!facts.storeEnabled) return copy.order.storeDisabledConfirm
  if (!facts.customerEnabled) return copy.order.customerDisabledConfirm
  return null
}

function salesActions(facts: OrderFacts): ActionSet {
  switch (facts.status) {
    case 'pending_confirm': {
      const blocked = confirmBlock(facts)
      const stopped = facts.discontinued.length > 0
      const discontinued = stopped
        ? copy.order.discontinuedConfirm(namesText(facts.discontinued))
        : null
      return {
        actions: [
          actionOf('cancel', null, false),
          actionOf('editAndConfirm', blocked, true),
          actionOf('confirm', blocked ?? discontinued, false),
        ],
        lockedReason: null,
      }
    }
    case 'to_ship':
      return {
        actions: [actionOf('cancel', null, true), actionOf('edit', null, true)],
        lockedReason: null,
      }
    case 'shipped':
      return afterActions('createAfter', facts, null)
    case 'cancelled':
      return NONE
  }
}

// 出货日期到了（不晚于今天）才能确认发货（阶段 3 确认）
function shippingActions(facts: OrderFacts, today: string): Action[] {
  if (facts.status !== 'to_ship') return []
  const notDue = facts.shipDate !== null && facts.shipDate > today ? copy.order.shipNotDue : null
  return [actionOf('ship', notDue, false)]
}

// 多模块员工是各模块的并集：销售的在前，发货的在后
export function orderActionsOf(roles: OrderRoles, facts: OrderFacts, today: string): ActionSet {
  if (roles.store) return storeActions(facts, today)
  const sales = roles.sales ? salesActions(facts) : NONE
  const shipping = roles.shipping ? shippingActions(facts, today) : []
  return { actions: [...sales.actions, ...shipping], lockedReason: sales.lockedReason }
}
