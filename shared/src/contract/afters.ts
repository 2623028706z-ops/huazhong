// 售后（05 章第 4、5 节，06 章 S7、S8、X5–X7）：门店申请，销售处理、关闭、新建，销售和财务作废
import * as z from 'zod'
import { AFTER_IMAGE_MAX_COUNT } from '../config.ts'
import { copy } from '../copy.ts'
import { redesignCopy } from '../copy-redesign.ts'
import { afterOrigins, afterReasons, afterStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsInputSchema,
  centsSchema,
  idSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  requiredTextSchema,
  timestampSchema,
  unitTotalSchema,
  versionSchema,
  STORED_INT_MAX,
} from '../rules.ts'
import { statementRefSchema } from './statement-ref.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  checkDistinct,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
} from './page.ts'

export const afterCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  status: z.enum(afterStatuses),
  origin: z.enum(afterOrigins),
  afterDate: businessDateSchema,
  orderId: idSchema,
  orderNo: z.string(),
  customerName: z.string(),
  storeName: z.string(),
  // 第一种产品的名称和一共几种（门店卡片第 2 行「粉玫瑰日常花束 等 2 项」）
  lineName: z.string(),
  lineCount: z.number().int().nonnegative(),
  units: z.array(unitTotalSchema),
  // 只有已处理的有金额；待处理、已关闭、已作废为 null
  amountCents: centsSchema.nullable(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
  statement: statementRefSchema.nullable(),
})
export type AfterCard = z.infer<typeof afterCardSchema>

const afterImageSchema = z.object({ fileId: idSchema, url: z.string(), thumbUrl: z.string() })

export const afterLineSchema = z.object({
  id: idSchema,
  orderLineId: idSchema,
  name: z.string(),
  unit: z.string(),
  // 门店原来申请的数量；销售新建的为 null
  requestedQty: z.number().int().positive().nullable(),
  qty: z.number().int().nonnegative(),
  priceCents: centsSchema,
  // 发货单价：售后单价只能改低
  shipPriceCents: centsSchema,
  // 排除这张售后本身后的可申请数量
  maxQty: z.number().int().nonnegative(),
  amountCents: centsSchema.nullable(),
  reason: z.enum(afterReasons),
  description: z.string(),
  images: z.array(afterImageSchema),
})
export type AfterLine = z.infer<typeof afterLineSchema>

export const afterDetailSchema = afterCardSchema.extend({
  shipDate: businessDateSchema,
  note: z.string().nullable(),
  lines: z.array(afterLineSchema),
  processedAt: timestampSchema.nullable(),
  closeReason: z.string().nullable(),
  // 关闭日志的真实时间；未关闭或历史缺少关闭日志时为空。
  closedAt: timestampSchema.nullable(),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  // 提示条：已处理时「发货单应收已减去售后金额」
  notice: z.string().nullable(),
})
export type AfterDetail = z.infer<typeof afterDetailSchema>

export const afterQuerySchema = pageQuerySchema
  .extend({
    status: z.enum([...afterStatuses, 'cancelled']).optional(),
    customerId: idSchema.optional(),
    q: z.string().trim().optional(),
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)

const reasonSchema = z.enum(afterReasons, { error: copy.after.reasonRequired })

export const listAfters = {
  method: 'GET',
  path: '/afters',
  grants: ['sales', 'finance', 'store'],
  query: afterQuerySchema,
  // 列表级 actions ⊆ createAfter（销售）；门店申请只从订单详情进入。
  response: countedPageSchema(afterCardSchema, afterStatuses),
  errors: [],
} as const satisfies Endpoint

export const getAfter = {
  method: 'GET',
  path: '/afters/:id',
  grants: ['sales', 'finance', 'store'],
  params: idParamsSchema,
  response: afterDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const getFinanceAfter = {
  method: 'GET',
  path: '/finance/afters/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: afterDetailSchema.extend({ actions: z.array(actionSchema).length(0) }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 同一张售后同一行发货明细只能一行
function checkAfterLines(value: { lines: { orderLineId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.lines,
    keyOf: (l) => l.orderLineId,
    message: copy.order.duplicateProduct,
    path: ['lines', 'orderLineId'],
  })
}

function checkAfterAmount(
  value: { lines: { qty: number; priceCents: number }[] },
  ctx: z.RefinementCtx,
) {
  const total = value.lines.reduce((sum, line) => sum + line.qty * line.priceCents, 0)
  if (!Number.isSafeInteger(total) || total > STORED_INT_MAX)
    ctx.addIssue({ code: 'custom', path: ['lines'], message: copy.error.numericRange })
}

export const afterCreateSchema = z
  .object({
    orderId: idSchema,
    note: z.string().trim(),
    lines: z
      .array(
        z.object({
          orderLineId: idSchema,
          qty: positiveIntSchema(copy.after.qtyOverMax),
          priceCents: centsInputSchema(copy.order.priceRequired),
          reason: reasonSchema,
          description: z.string().trim(),
        }),
      )
      .min(1, { error: copy.after.salesLinesRequired }),
  })
  .superRefine(checkAfterLines)
  .superRefine(checkAfterAmount)
export type AfterCreate = z.infer<typeof afterCreateSchema>

export const createAfter = {
  method: 'POST',
  path: '/afters',
  grants: ['sales'],
  body: afterCreateSchema,
  response: afterDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint

export const afterProcessSchema = z
  .object({
    version: versionSchema,
    note: z.string().trim(),
    lines: z.array(
      z.object({
        id: idSchema,
        qty: nonNegativeIntSchema(copy.after.processQtyInvalid),
        priceCents: centsInputSchema(copy.order.priceRequired),
      }),
    ),
  })
  .superRefine(checkAfterAmount)
export type AfterProcess = z.infer<typeof afterProcessSchema>

export const processAfter = {
  method: 'POST',
  path: '/afters/:id/process',
  grants: ['sales'],
  params: idParamsSchema,
  body: afterProcessSchema,
  response: afterDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const closeAfter = {
  method: 'POST',
  path: '/afters/:id/close',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: z.string().trim().default(''),
  }),
  response: afterDetailSchema,
  errors: ['NOT_FOUND', 'STALE'],
} as const satisfies Endpoint

export const voidAfter = {
  method: 'POST',
  path: '/afters/:id/void',
  grants: ['sales'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.after.voidReasonRequired),
  }),
  response: afterDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

export const storeAfterCreateSchema = z
  .object({
    orderId: idSchema,
    lines: z
      .array(
        z.object({
          orderLineId: idSchema,
          qty: positiveIntSchema(copy.after.storeQtyInvalid),
          reason: reasonSchema,
          description: z.string().trim().default(''),
          imageFileIds: z
            .array(idSchema)
            .max(AFTER_IMAGE_MAX_COUNT, { error: copy.after.imagesTooMany(AFTER_IMAGE_MAX_COUNT) }),
        }),
      )
      .min(1, { error: copy.after.linesRequired }),
  })
  .superRefine((value, ctx) => {
    checkAfterLines(value, ctx)
    // 「数量不符」（少发、漏发）不用传图片，其余原因至少 1 张
    value.lines.forEach((line, index) => {
      if (line.reason !== 'qty_mismatch' && line.imageFileIds.length === 0)
        ctx.addIssue({
          code: 'custom',
          message: redesignCopy.afterImageRequired,
          path: ['lines', index, 'imageFileIds'],
        })
    })
  })
export type StoreAfterCreate = z.infer<typeof storeAfterCreateSchema>

export const createStoreAfter = {
  method: 'POST',
  path: '/store/afters',
  grants: ['store'],
  body: storeAfterCreateSchema,
  response: afterDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
