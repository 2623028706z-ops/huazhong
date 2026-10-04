// 阶段 5 仓库：手工入库、手工出库、报损、出库分类、盘点、出入库记录、供应商端入库单详情
// （03 章第 8.3 节、04 章第 6 节、05 章第 8、9 节、06 章 W4–W15）
import * as z from 'zod'
import { AFTER_IMAGE_MAX_COUNT } from '../config.ts'
import { copy } from '../copy.ts'
import { moveTypes, stocktakeStatuses, whDocKinds, whDocStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsInputSchema,
  centsSchema,
  idSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  requiredIdSchema,
  requiredTextSchema,
  timestampSchema,
  unitTotalSchema,
  versionSchema,
  STORED_INT_MAX,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { statementRefSchema } from './statement-ref.ts'
import {
  checkDateRange,
  checkDistinct,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'

const recordShape = { id: idSchema, actorLabel: z.string(), createdAt: timestampSchema }
const actions = z.array(actionSchema)

// 卡片三行：日期 + 状态；供应商 / 出库分类 / 花材 + 数量；单号 + 经办人
export const whDocCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  kind: z.enum(whDocKinds),
  status: z.enum(whDocStatuses),
  docDate: businessDateSchema,
  supplierId: idSchema.nullable(),
  supplierName: z.string().nullable(),
  outCategoryId: idSchema.nullable(),
  outCategoryName: z.string().nullable(),
  materials: z.array(z.object({ name: z.string(), qty: z.number().int().positive() })),
  units: z.array(unitTotalSchema),
  actorName: z.string(),
  // 手工入库才有金额和财务状态；出库、报损为 null
  amountCents: centsSchema.nullable(),
  repriced: z.boolean(),
  actions,
  lockedReason: z.string().nullable(),
  statement: statementRefSchema.nullable(),
})
export type WhDocCard = z.infer<typeof whDocCardSchema>

const whDocLineSchema = z.object({
  id: idSchema,
  materialId: idSchema,
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  qty: z.number().int().positive(),
  // 手工入库才有；出库、报损为 null
  priceCents: centsSchema.nullable(),
  amountCents: centsSchema.nullable(),
})
const priceChangeSchema = z.object({
  ...recordShape,
  reason: z.string(),
  items: z.array(z.object({ name: z.string(), fromCents: centsSchema, toCents: centsSchema })),
})
const imageSchema = z.object({ fileId: idSchema, url: z.string(), thumbUrl: z.string() })
export const whDocDetailSchema = whDocCardSchema.extend({
  reason: z.string().nullable(),
  createdAt: timestampSchema,
  lines: z.array(whDocLineSchema),
  priceChanges: z.array(priceChangeSchema),
  images: z.array(imageSchema),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  voidedBy: z.string().nullable(),
})
export type WhDocDetail = z.infer<typeof whDocDetailSchema>

export const whDocQuerySchema = pageQuerySchema
  .extend({
    kind: z.enum(whDocKinds),
    status: z.enum(whDocStatuses).optional(),
    supplierId: idSchema.optional(),
    outCategoryId: idSchema.optional(),
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)
export const listWhDocs = {
  method: 'GET',
  path: '/warehouse/docs',
  grants: ['warehouse'],
  query: whDocQuerySchema,
  response: pageSchema(whDocCardSchema).extend({ counts: z.object({}) }),
  errors: [],
} as const satisfies Endpoint
export const getWhDoc = {
  method: 'GET',
  path: '/warehouse/docs/:id',
  grants: ['warehouse', 'finance'],
  params: idParamsSchema,
  response: whDocDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

function distinctMaterials(value: { lines: { materialId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.lines,
    keyOf: (line) => line.materialId,
    message: copy.rework.materialDuplicate,
    path: ['lines', 'materialId'],
  })
}
const qtyLine = {
  materialId: requiredIdSchema(copy.stock.linesRequired),
  qty: positiveIntSchema(copy.stock.qtyInvalid),
}
const linesOf = <T extends z.ZodType>(line: T) => z.array(line).min(1, copy.stock.linesRequired)
// 三种单据共用一个接口，按 kind 区分必填项（05 章第 9 节）
export const whDocCreateSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('in'),
      supplierId: requiredIdSchema(copy.stock.supplierRequired),
      reason: z.string().trim(),
      lines: linesOf(
        z.object({ ...qtyLine, priceCents: centsInputSchema(copy.stock.priceRequired) }),
      ),
    }),
    z.object({
      kind: z.literal('out'),
      outCategoryId: requiredIdSchema(copy.stock.outCategoryRequired),
      reason: z.string().trim(),
      lines: linesOf(z.object(qtyLine)),
    }),
    z.object({
      kind: z.literal('loss'),
      reason: requiredTextSchema(copy.stock.lossReasonRequired),
      imageFileIds: z
        .array(idSchema)
        .max(AFTER_IMAGE_MAX_COUNT, { error: copy.stock.imagesTooMany(AFTER_IMAGE_MAX_COUNT) })
        .default([]),
      lines: linesOf(z.object(qtyLine)),
    }),
  ])
  .superRefine(distinctMaterials)
export const createWhDoc = {
  method: 'POST',
  path: '/warehouse/docs',
  grants: ['warehouse'],
  body: whDocCreateSchema,
  response: whDocDetailSchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const repriceWhDoc = {
  method: 'POST',
  path: '/warehouse/docs/:id/reprice',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z
    .object({
      version: versionSchema,
      reason: requiredTextSchema(copy.finance.repriceReason),
      lines: z
        .array(
          z.object({ lineId: idSchema, priceCents: centsInputSchema(copy.stock.priceRequired) }),
        )
        .min(1, copy.stock.linesRequired),
    })
    .superRefine((value, ctx) => {
      checkDistinct(ctx, {
        items: value.lines,
        keyOf: (line) => line.lineId,
        message: copy.rework.materialDuplicate,
        path: ['lines', 'lineId'],
      })
    }),
  response: whDocDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const voidWhDoc = {
  method: 'POST',
  path: '/warehouse/docs/:id/void',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.rework.voidReasonRequired),
  }),
  response: whDocDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 供应商端入库单详情（P5 点手工入库单）：只看本家，明细、改价记录、所属对账单（无资金核销）
export const supplierStockInSchema = whDocDetailSchema
  .omit({ outCategoryId: true, outCategoryName: true, images: true })
  .extend({ title: z.string() })
export const getSupplierStockIn = {
  method: 'GET',
  path: '/supplier/stock-ins/:id',
  grants: ['supplier'],
  params: idParamsSchema,
  response: supplierStockInSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 出库分类：改名、新增、启用 / 停用，至少保留一个启用的
export const outCategorySchema = z.object({
  id: idSchema,
  name: z.string(),
  enabled: z.boolean(),
  sort: z.number().int(),
})
export type OutCategory = z.infer<typeof outCategorySchema>
export const listOutCategories = {
  method: 'GET',
  path: '/out-categories',
  grants: ['warehouse'],
  response: pageSchema(outCategorySchema),
  errors: [],
} as const satisfies Endpoint
const outCategoryBody = z.object({
  name: requiredTextSchema(copy.stock.categoryNameRequired),
  enabled: z.boolean(),
})
export const createOutCategory = {
  method: 'POST',
  path: '/out-categories',
  grants: ['warehouse'],
  body: outCategoryBody,
  response: outCategorySchema,
  errors: ['BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const updateOutCategory = {
  method: 'PATCH',
  path: '/out-categories/:id',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: outCategoryBody,
  response: outCategorySchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint

// 盘点：先选分类取账面数，确认时复查账面数；确认即完成，不能修改或作废
export const stocktakeCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  checkDate: businessDateSchema,
  status: z.enum(stocktakeStatuses),
  categories: z.array(z.string()),
  lineCount: z.number().int().nonnegative(),
  diffCount: z.number().int().nonnegative(),
  actorName: z.string(),
  actions,
  lockedReason: z.string().nullable(),
})
export type StocktakeCard = z.infer<typeof stocktakeCardSchema>
export const stocktakeDetailSchema = stocktakeCardSchema.extend({
  reason: z.string().nullable(),
  createdAt: timestampSchema,
  lines: z.array(
    z.object({
      materialId: idSchema,
      name: z.string(),
      unit: z.string(),
      bookQty: z.number().int().nonnegative(),
      actualQty: z.number().int().nonnegative(),
      diffQty: z.number().int(),
    }),
  ),
})
export const stocktakeDraftSchema = z.object({
  categories: z.array(z.object({ id: idSchema, name: z.string() })),
  lines: z.array(
    z.object({
      materialId: idSchema,
      name: z.string(),
      code: z.string(),
      unit: z.string(),
      enabled: z.boolean(),
      bookQty: z.number().int().nonnegative(),
    }),
  ),
})
export type StocktakeDraft = z.infer<typeof stocktakeDraftSchema>
// ?categoryIds=1,2
const categoryIdsSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? [] : value.split(',')))
  .pipe(z.array(idSchema).min(1, copy.stock.categoriesRequired))
export const listStocktakes = {
  method: 'GET',
  path: '/stocktakes',
  grants: ['warehouse'],
  query: pageQuerySchema,
  response: pageSchema(stocktakeCardSchema),
  errors: [],
} as const satisfies Endpoint
export const getStocktakeDraft = {
  method: 'GET',
  path: '/stocktakes/draft',
  grants: ['warehouse'],
  query: z.object({ categoryIds: categoryIdsSchema }),
  response: stocktakeDraftSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const getStocktake = {
  method: 'GET',
  path: '/stocktakes/:id',
  grants: ['warehouse'],
  params: idParamsSchema,
  response: stocktakeDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const createStocktake = {
  method: 'POST',
  path: '/stocktakes',
  grants: ['warehouse'],
  body: z
    .object({
      categoryIds: z.array(idSchema).min(1, copy.stock.categoriesRequired),
      reason: z.string().trim(),
      lines: z.array(
        z.object({
          materialId: idSchema,
          bookQty: z
            .number()
            .int()
            .nonnegative()
            .max(STORED_INT_MAX, { error: copy.error.numericRange }),
          actualQty: nonNegativeIntSchema(copy.stock.actualQtyInvalid),
        }),
      ),
    })
    .superRefine((value, ctx) => {
      distinctMaterials(value, ctx)
      if (value.reason === '' && value.lines.some((line) => line.actualQty !== line.bookQty))
        ctx.addIssue({ code: 'custom', message: copy.stock.diffReasonRequired, path: ['reason'] })
    }),
  response: stocktakeDetailSchema,
  errors: ['NOT_FOUND', 'STALE'],
  idempotent: true,
} as const satisfies Endpoint

// 出入库记录：单种花材、时间倒序；批次显示完整入库日期。
export const stockMoveSchema = z.object({
  id: idSchema,
  movedAt: timestampSchema,
  type: z.enum(moveTypes),
  materialId: idSchema,
  materialName: z.string(),
  unit: z.string(),
  qty: z.number().int(),
  batchLabel: z.string(),
  docType: z.enum(['po', 'wh', 'stocktake']),
  docId: idSchema,
  docNo: z.string(),
  actorName: z.string(),
})
export type StockMove = z.infer<typeof stockMoveSchema>
export const listStockMoves = {
  method: 'GET',
  path: '/warehouse/moves',
  grants: ['warehouse'],
  query: pageQuerySchema
    .extend({
      direction: z.enum(['in', 'out']).optional(),
      materialId: idSchema,
      ...dateRangeShape,
    })
    .superRefine(checkDateRange),
  response: pageSchema(stockMoveSchema),
  errors: [],
} as const satisfies Endpoint

export const getFinanceWhDoc = {
  method: 'GET',
  path: '/finance/warehouse-docs/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: whDocDetailSchema.extend({ actions: z.array(actionSchema).length(0) }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
