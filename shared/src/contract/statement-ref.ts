import * as z from 'zod'
import { idSchema } from '../rules.ts'
import { statementKinds, statementStatuses } from '../enums.ts'
export const statementKindSchema = z.enum(statementKinds)
export const statementStatusSchema = z.enum(statementStatuses)
export const statementRefSchema = z.object({
  id: idSchema,
  no: z.string(),
  status: z.enum(['unsettled', 'settled']),
})
export type StatementRef = z.infer<typeof statementRefSchema>
export type StatementKind = z.infer<typeof statementKindSchema>
export type StatementStatus = z.infer<typeof statementStatusSchema>
