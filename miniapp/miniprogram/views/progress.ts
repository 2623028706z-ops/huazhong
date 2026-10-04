import {
  labels,
  redesignCopy,
  shanghaiDayOf,
  type AfterDetail,
  type InviteDetail,
  type OrderDetail,
  type PoDetail,
  type StatementRef,
} from '@huazhong/shared'

export interface ProgressStep {
  label: string
  date: string
  state: 'done' | 'current' | 'pending' | 'ended'
}
type OrderProgress = Pick<
  OrderDetail,
  'orderDate' | 'status' | 'confirmedAt' | 'shippedAt' | 'shipDate' | 'cancelledAt' | 'voidedAt'
>
type AfterProgress = Pick<
  AfterDetail,
  'afterDate' | 'status' | 'processedAt' | 'closedAt' | 'voidedAt'
>
type PoProgress = Pick<PoDetail, 'orderDate' | 'status' | 'receivedAt' | 'cancelledAt' | 'voidedAt'>
type InviteProgress = Pick<InviteDetail, 'inviteDate' | 'status' | 'submittedAt' | 'cancelledAt'>

function dayOf(value: string | null): string {
  return value ? shanghaiDayOf(value) : ''
}
export function statementText(statement: StatementRef | null): string {
  return statement
    ? `${statement.no} · ${labels.statementStatus[statement.status]}`
    : redesignCopy.unstatemented
}
function appendVoid(steps: ProgressStep[], voidedAt: string | null): ProgressStep[] {
  return [
    ...steps.map((step): ProgressStep => ({
      ...step,
      state: step.state === 'current' ? 'done' : step.state,
    })),
    { label: redesignCopy.voided, date: dayOf(voidedAt), state: 'ended' },
  ]
}
function confirmationStep(order: OrderProgress): ProgressStep {
  const confirmed =
    order.confirmedAt !== null || ['to_ship', 'shipped', 'voided'].includes(order.status)
  return {
    label: confirmed ? redesignCopy.confirmed : redesignCopy.pendingConfirm,
    date: dayOf(order.confirmedAt),
    state: confirmed ? 'done' : order.status === 'pending_confirm' ? 'current' : 'pending',
  }
}
function shipmentStep(order: OrderProgress): ProgressStep {
  if (order.status === 'cancelled')
    return { label: redesignCopy.cancelled, date: dayOf(order.cancelledAt), state: 'ended' }
  if (order.status === 'shipped' || order.status === 'voided')
    return { label: redesignCopy.shipped, date: dayOf(order.shippedAt), state: 'current' }
  return {
    label: redesignCopy.toShip,
    date:
      order.status === 'to_ship'
        ? `${redesignCopy.shipDate} / ${order.shipDate ?? redesignCopy.waiting}`
        : '',
    state: order.status === 'to_ship' ? 'current' : 'pending',
  }
}
export function orderProgress(order: OrderProgress): ProgressStep[] {
  const steps: ProgressStep[] = [
    { label: redesignCopy.opening, date: order.orderDate, state: 'done' },
    confirmationStep(order),
    shipmentStep(order),
  ]
  return order.status === 'voided' ? appendVoid(steps, order.voidedAt) : steps
}
export function afterProgress(after: AfterProgress): ProgressStep[] {
  const processed = after.status === 'processed' || after.status === 'voided'
  const steps: ProgressStep[] = [
    { label: redesignCopy.submitted, date: after.afterDate, state: 'done' },
    {
      label: redesignCopy.pending,
      date: '',
      state: processed ? 'done' : after.status === 'pending' ? 'current' : 'pending',
    },
    {
      label: after.status === 'closed' ? redesignCopy.closed : redesignCopy.processed,
      date: dayOf(after.status === 'closed' ? after.closedAt : after.processedAt),
      state: after.status === 'closed' ? 'ended' : processed ? 'current' : 'pending',
    },
  ]
  return after.status === 'voided' ? appendVoid(steps, after.voidedAt) : steps
}
function receivedStep(po: PoProgress): ProgressStep {
  if (po.status === 'cancelled' || po.status === 'rejected')
    return {
      label: labels.poStatus[po.status],
      date: dayOf(po.status === 'rejected' ? po.receivedAt : po.cancelledAt),
      state: 'ended',
    }
  return {
    label:
      po.status === 'received' || po.status === 'voided'
        ? redesignCopy.received
        : redesignCopy.toReceive,
    date: dayOf(po.receivedAt),
    state: 'current',
  }
}
export function poProgress(po: PoProgress): ProgressStep[] {
  const steps: ProgressStep[] = [
    { label: redesignCopy.opening, date: po.orderDate, state: 'done' },
    receivedStep(po),
  ]
  return po.status === 'voided' ? appendVoid(steps, po.voidedAt) : steps
}
export function inviteProgress(invite: InviteProgress): ProgressStep[] {
  const cancelled = invite.status === 'cancelled'
  return [
    { label: redesignCopy.invited, date: invite.inviteDate, state: 'done' },
    {
      label: cancelled
        ? redesignCopy.cancelled
        : invite.status === 'submitted'
          ? redesignCopy.submitted
          : redesignCopy.toSupply,
      date: dayOf(invite.submittedAt ?? invite.cancelledAt),
      state: cancelled ? 'ended' : 'current',
    },
  ]
}

export function externalProgressOf(steps: ProgressStep[]): ProgressStep[] {
  return steps.map((step) =>
    step.label === redesignCopy.voided ? { ...step, label: redesignCopy.cancelled } : step,
  )
}
