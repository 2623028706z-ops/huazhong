// 数据库原生 enum：值直接取 shared 的枚举（04 章第 1 节）
import {
  accountTypes,
  cancelRequestStatuses,
  refundKinds,
  whDocKinds,
  whDocStatuses,
  afterOrigins,
  afterReasons,
  afterStatuses,
  allocKinds,
  filePurposes,
  fileStatuses,
  methodKinds,
  moduleKeys,
  inviteStatuses,
  orderOrigins,
  orderStatuses,
  poStatuses,
  moveTypes,
  recordStatuses,
  storeInviteStatuses,
} from '@huazhong/shared'
import { pgEnum } from 'drizzle-orm/pg-core'

export const accountType = pgEnum('account_type', accountTypes)
export const moduleKey = pgEnum('module_key', moduleKeys)
export const orderStatus = pgEnum('order_status', orderStatuses)
export const orderOrigin = pgEnum('order_origin', orderOrigins)
export const storeInviteStatus = pgEnum('store_invite_status', storeInviteStatuses)
export const afterStatus = pgEnum('after_status', afterStatuses)
export const afterOrigin = pgEnum('after_origin', afterOrigins)
export const afterReason = pgEnum('after_reason', afterReasons)
export const recordStatus = pgEnum('record_status', recordStatuses)
export const allocKind = pgEnum('alloc_kind', allocKinds)
export const cancelRequestStatus = pgEnum('cancel_request_status', cancelRequestStatuses)
export const refundKind = pgEnum('refund_kind', refundKinds)
export const whDocKind = pgEnum('wh_doc_kind', whDocKinds)
export const whDocStatus = pgEnum('wh_doc_status', whDocStatuses)
export const methodKind = pgEnum('method_kind', methodKinds)
export const fileStatus = pgEnum('file_status', fileStatuses)
export const filePurpose = pgEnum('file_purpose', filePurposes)
export const inviteStatus = pgEnum('invite_status', inviteStatuses)
export const poStatus = pgEnum('po_status', poStatuses)
export const moveType = pgEnum('move_type', moveTypes)
