// 订单：卡片、详情、列表（05 章第 4–6 节，06 章 S3、S6、X2、X3、H2、H3）。
// 销售、发货、财务、门店（本店）都读；写接口在 order-writes.ts、store.ts
import * as z from 'zod'
import { cancelRequestStatuses, orderOrigins, orderStatuses } from '../enums.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  timestampSchema,
  unitTotalSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import { afterCardSchema } from './afters.ts'
import { statementRefSchema } from './statement-ref.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
} from './page.ts'

export const orderCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  status: z.enum(orderStatuses),
  origin: z.enum(orderOrigins),
  orderDate: businessDateSchema,
  // 门店下的单待确认时为 null（「待定」）
  shipDate: businessDateSchema.nullable(),
  customerId: idSchema,
  customerName: z.string(),
  storeId: idSchema,
  storeName: z.string(),
  // 第一种产品的名称和一共几种（门店卡片第 2 行）
  lineName: z.string(),
  lineCount: z.number().int().nonnegative(),
  // 已发货按实发合计
  units: z.array(unitTotalSchema),
  // 发货前是订单金额，已发货是发货金额
  amountCents: centsSchema,
  changed: z.boolean(),
  repriced: z.boolean(),
  cancelRequested: z.boolean(),
  actions: z.array(actionSchema),
  lockedReason: z.string().nullable(),
})
export type OrderCard = z.infer<typeof orderCardSchema>

export const orderLineSchema = z.object({
  id: idSchema,
  productId: idSchema,
  name: z.string(),
  unit: z.string(),
  // 下单时的客户产品编码（和名称、单位一样快照），没填为 ''
  customerCode: z.string(),
  qty: z.number().int().positive(),
  priceCents: centsSchema,
  listPriceCents: centsSchema,
  // 单价和下单时的目录价不同
  repriced: z.boolean(),
  // 目录里停用或产品本身停用
  discontinued: z.boolean(),
  // 已发货才有
  shippedQty: z.number().int().nonnegative().nullable(),
  // 实发少于订单数量
  short: z.boolean(),
  over: z.boolean(),
  // 已发货才有：可申请售后数量
  maxQty: z.number().int().nonnegative().nullable(),
  // 发货前按数量，已发货按实发
  amountCents: centsSchema,
})
export type OrderLine = z.infer<typeof orderLineSchema>

export const orderChangeSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  actorLabel: z.string(),
  // 门店改单没有原因
  reason: z.string().nullable(),
  items: z.array(z.string()),
})
export type OrderChange = z.infer<typeof orderChangeSchema>
export const cancelRequestSchema = z.object({
  id: idSchema,
  status: z.enum(cancelRequestStatuses),
  reason: z.string(),
  requestedAt: timestampSchema,
  requestedBy: z.string(),
  handledAt: timestampSchema.nullable(),
  rejectReason: z.string().nullable(),
})

export const orderDetailSchema = orderCardSchema.extend({
  note: z.string().nullable(),
  confirmedAt: timestampSchema.nullable(),
  contactName: z.string(),
  contactPhone: z.string(),
  address: z.string(),
  statement: statementRefSchema.nullable(),
  overdue: z.object({ amountCents: centsSchema, days: z.number().int().positive() }).nullable(),
  customerEnabled: z.boolean(),
  storeEnabled: z.boolean(),
  lines: z.array(orderLineSchema),
  changes: z.array(orderChangeSchema),
  shippedBy: z.string().nullable(),
  shippedAt: timestampSchema.nullable(),
  shipNote: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  cancelRequests: z.array(cancelRequestSchema),
  // 已发货的才有（门店看不到已关闭、已作废的金额）
  afters: z.array(afterCardSchema),
})
export type OrderDetail = z.infer<typeof orderDetailSchema>
// 发货端不显示单价和金额（06 章 H3），改价标记也算价格信息
export const shippingCardSchema = orderCardSchema
  .omit({ amountCents: true, repriced: true })
  .strict()
export const shippingLineSchema = orderLineSchema
  .omit({ priceCents: true, listPriceCents: true, amountCents: true, maxQty: true, repriced: true })
  .strict()
export const shippingDetailSchema = shippingCardSchema
  .extend({
    note: z.string().nullable(),
    confirmedAt: timestampSchema.nullable(),
    contactName: z.string(),
    contactPhone: z.string(),
    address: z.string(),
    lines: z.array(shippingLineSchema),
    changes: z.array(orderChangeSchema),
    cancelRequests: z.array(cancelRequestSchema),
    shippedBy: z.string().nullable(),
    shippedAt: timestampSchema.nullable(),
    shipNote: z.string().nullable(),
    cancelReason: z.string().nullable(),
    cancelledAt: timestampSchema.nullable(),
    voidReason: z.string().nullable(),
    voidedAt: timestampSchema.nullable(),
  })
  .strict()
export type ShippingCard = z.infer<typeof shippingCardSchema>
export type ShippingDetail = z.infer<typeof shippingDetailSchema>

export const orderQuerySchema = pageQuerySchema
  .extend({
    status: z.enum(orderStatuses).optional(),
    customerId: idSchema.optional(),
    // 单号、客户、门店
    q: z.string().trim().optional(),
    // 只要能申请或新建售后的已发货订单（S7、X5 选订单的弹层）
    afterable: z.stringbool().optional(),
    cancelRequested: z.stringbool().optional(),
    // 按下单日期
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)

export const listOrders = {
  method: 'GET',
  path: '/orders',
  grants: ['sales', 'finance', 'store'],
  query: orderQuerySchema,
  // 列表级 actions ⊆ create（销售）
  response: countedPageSchema(orderCardSchema, orderStatuses),
  errors: [],
} as const satisfies Endpoint

// 发货单：待发货按出货日期升序（含以后的），已发货按发货时间降序；
// 不传状态 = 全部，待发货在前、已发货在后，翻页跨段连续
export const listShippingOrders = {
  method: 'GET',
  path: '/shipping/orders',
  grants: ['shipping'],
  query: pageQuerySchema.extend({
    status: z.enum(['to_ship', 'shipped']).optional(),
    q: z.string().trim().optional(),
    dueOnly: z.stringbool().optional(),
  }),
  response: countedPageSchema(shippingCardSchema, orderStatuses),
  errors: [],
} as const satisfies Endpoint

export const getOrder = {
  method: 'GET',
  path: '/orders/:id',
  grants: ['sales', 'finance', 'store'],
  params: idParamsSchema,
  response: orderDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const getShippingOrder = {
  method: 'GET',
  path: '/shipping/orders/:id',
  grants: ['shipping'],
  params: idParamsSchema,
  response: shippingDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

export const getFinanceOrder = {
  method: 'GET',
  path: '/finance/orders/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: orderDetailSchema.extend({ actions: z.array(actionSchema).length(0) }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
