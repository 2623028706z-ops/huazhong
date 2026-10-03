import * as z from 'zod'
import { allocKinds, allocationStatuses, recordStatuses, refundKinds } from '../enums.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'

export const ledgerTokenSchema = z.string().min(1)
export const externalAllocationSchema = z.object({
  date: businessDateSchema,
  amountCents: centsSchema,
})
export const actorSchema = z.object({ id: idSchema, name: z.string() })
export const allocationHistoryShape = {
  id: idSchema,
  kind: z.enum(allocKinds),
  createdAt: timestampSchema,
  createdBy: actorSchema,
  registeredCents: centsSchema,
  effectiveCents: centsSchema,
  status: z.enum(allocationStatuses),
  revokedAt: timestampSchema.nullable(),
  revokedBy: actorSchema.nullable(),
  revokeReason: z.string().nullable(),
  actions: z.array(actionSchema),
}
export const paymentAllocationSchema = z.object({
  ...allocationHistoryShape,
  paymentId: idSchema,
  paymentNo: z.string(),
  docType: z.enum(['po', 'wh']),
  docId: idSchema,
  docNo: z.string(),
})
export const refundSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  kind: z.enum(refundKinds),
  receiptId: idSchema.nullable(),
  paymentId: idSchema.nullable(),
  refundDate: businessDateSchema,
  amountCents: centsSchema,
  methodName: z.string(),
  note: z.string().nullable(),
  status: z.enum(recordStatuses),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  voidedBy: actorSchema.nullable(),
  actions: z.array(actionSchema),
})
export type RefundDetail = z.infer<typeof refundSchema>
export type PaymentAllocation = z.infer<typeof paymentAllocationSchema>
export const receiptExpectedSchema = z.object({
  orderId: idSchema,
  version: versionSchema,
  unpaidCents: centsSchema,
})
export const paymentExpectedSchema = z.object({
  docType: z.enum(['po', 'wh']),
  docId: idSchema,
  version: versionSchema,
  unpaidCents: centsSchema,
})
