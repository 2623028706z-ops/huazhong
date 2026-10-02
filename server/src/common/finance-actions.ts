import { type Action, type RecordStatus } from '@huazhong/shared'
import { enabledAction } from './domain/actions.ts'
import type { Viewer } from './domain/viewer.ts'
import { ownActions } from './ledger.ts'

export function fundActions(
  source: { kind: 'receipt' | 'payment'; createdBy: number; status: RecordStatus },
  balance: number,
  hasRefund: boolean,
  viewer?: Viewer,
): Action[] {
  if (source.status !== 'valid') return []
  const actions = hasRefund
    ? []
    : ownActions(
        viewer,
        source.createdBy,
        source.kind === 'receipt' ? 'voidReceipt' : 'voidPayment',
      )
  if (viewer?.modules.includes('finance') && balance > 0)
    actions.push(
      enabledAction(source.kind === 'receipt' ? 'refundReceipt' : 'refundPayment', false),
    )
  return actions
}
