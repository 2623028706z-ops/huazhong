import * as z from 'zod'
import { statementCopy } from '../copy-statements.ts'
import { financeCopy } from '../copy-finance.ts'
import {
  STORED_INT_MAX,
  businessDateSchema,
  centsSchema,
  idSchema,
  timestampSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
export const actorSchema = z.object({ id: idSchema, name: z.string() })
export const creditSourceSchema = z.object({
  type: z.enum(['receipt', 'payment', 'statement']),
  id: idSchema,
  no: z.string(),
  amountCents: centsSchema,
})
export const refundSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  kind: z.enum(['receipt', 'payment']),
  customerId: idSchema.nullable(),
  supplierId: idSchema.nullable(),
  refundDate: businessDateSchema,
  amountCents: centsSchema,
  methodName: z.string(),
  note: z.string(),
  status: z.enum(['valid', 'voided']),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  voidedBy: actorSchema.nullable(),
  sources: z.array(creditSourceSchema),
  actions: z.array(actionSchema),
})
export type RefundDetail = z.infer<typeof refundSchema>
export const fundStatementSchema = z.object({
  id: idSchema,
  no: z.string(),
  periodFrom: businessDateSchema,
  periodTo: businessDateSchema,
  dueCents: centsSchema,
  amountCents: centsSchema,
  status: z.enum(['unsettled', 'settled', 'voided']),
  reversedAt: timestampSchema.nullable(),
})
export const fundDetailShape = {
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  amountCents: centsSchema,
  discountCents: centsSchema,
  discountReason: z.string(),
  creditCents: centsSchema,
  creditBalanceCents: centsSchema,
  methodName: z.string(),
  note: z.string(),
  createdBy: actorSchema,
  createdAt: timestampSchema,
  status: z.enum(['valid', 'voided']),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  voidedBy: actorSchema.nullable(),
  statements: z.array(fundStatementSchema),
  refunds: z.array(refundSchema),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
}
export const fundInputShape = {
  amountCents: z.number().int().positive().max(STORED_INT_MAX),
  discountCents: z.number().int().nonnegative().max(STORED_INT_MAX).default(0),
  discountReason: z.string().trim().default(''),
  methodName: z.string().trim().min(1, financeCopy.methodRequired),
  note: z.string().trim(),
  statements: z.array(z.object({ id: idSchema, version: versionSchema })),
}
export function checkFundInput(
  value: { discountCents: number; discountReason: string; statements: { id: string }[] },
  ctx: z.RefinementCtx,
) {
  if (!value.statements.length && value.discountCents)
    ctx.addIssue({
      code: 'custom',
      path: ['discountCents'],
      message: financeCopy.discountWithoutStatement,
    })
  const seen = new Set<string>()
  value.statements.forEach((s, i) => {
    if (seen.has(s.id))
      ctx.addIssue({
        code: 'custom',
        path: ['statements', i, 'id'],
        message: statementCopy.duplicateStatement,
      })
    seen.add(s.id)
  })
}
