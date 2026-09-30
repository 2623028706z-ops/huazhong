// 列表：游标分页 + 列表级 actions（00 章第 3 节、05 章第 1.3 节）
import * as z from 'zod'
import { PAGE_SIZE, PAGE_SIZE_MAX } from '../config.ts'
import { actionSchema } from './actions.ts'

export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(PAGE_SIZE_MAX).default(PAGE_SIZE),
})

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    actions: z.array(actionSchema),
  })
}
