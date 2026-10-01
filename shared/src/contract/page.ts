// 列表：游标分页 + 列表级 actions（00 章第 3 节、05 章第 1.3 节）
import * as z from 'zod'
import { PAGE_SIZE, PAGE_SIZE_MAX } from '../config.ts'
import { copy } from '../copy.ts'
import { businessDateSchema, idSchema } from '../rules.ts'
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

// 带状态筛选的列表：顶层多 counts，只含等待类状态（05 章第 1.3 节）
export function countedPageSchema<T extends z.ZodType, S extends readonly [string, ...string[]]>(
  item: T,
  statuses: S,
) {
  return pageSchema(item).extend({
    counts: z.partialRecord(z.enum(statuses), z.number().int().nonnegative()),
  })
}

// 明细里同一种产品、花材只能出现一次（04 章第 10 节）：重复的那一行标红。
// path 是 [明细字段, 行里的字段]，例如 ['lines', 'productId'] → lines.1.productId
interface DistinctRule<T> {
  items: readonly T[]
  keyOf: (item: T) => string
  message: string
  path: readonly [string, string]
}

export function checkDistinct<T>(ctx: z.RefinementCtx, rule: DistinctRule<T>): void {
  const seen = new Set<string>()
  rule.items.forEach((item, index) => {
    const key = rule.keyOf(item)
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        message: rule.message,
        path: [rule.path[0], index, rule.path[1]],
      })
    }
    seen.add(key)
  })
}

// 单据路径参数 /:id
export const idParamsSchema = z.object({ id: idSchema })

// 列表的日期筛选 ?from=&to=：两头都含，都不传 = 全部（05 章第 1.3 节）
export const dateRangeShape = {
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
}

interface DateRange {
  from?: string | undefined
  to?: string | undefined
}

// to 早于 from：两个日期框都标红（07 章 G11）
export function checkDateRange(range: DateRange, ctx: z.RefinementCtx): void {
  if (range.from === undefined || range.to === undefined || range.to >= range.from) return
  for (const path of ['from', 'to']) {
    ctx.addIssue({ code: 'custom', message: copy.error.dateRange, path: [path] })
  }
}
