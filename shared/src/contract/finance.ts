// 客户对账（05 章第 10 节，06 章 F2、F3、S9）：发货单的应收、已收、未收、预收由核销现算，不存库
import * as z from 'zod'
import { payStatuses } from '../enums.ts'
import { allocationHistoryShape, ledgerTokenSchema, refundSchema } from './ledger.ts'
import { businessDateSchema, centsSchema, idSchema, unitTotalSchema } from '../rules.ts'
import { afterCardSchema } from './afters.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
  pageSchema,
} from './page.ts'

// 发货单（已发货订单）的收款情况；门店对账同一个结构
export const arCardSchema = z.object({
  version: z.number().int().positive(),
  orderId: idSchema,
  orderNo: z.string(),
  shipDate: businessDateSchema,
  storeName: z.string(),
  units: z.array(unitTotalSchema),
  // 发货金额
  shippedCents: centsSchema,
  // 已处理售后合计
  afterCents: centsSchema,
  // 应收 = 发货金额 − 售后，不小于 0
  receivableCents: centsSchema,
  receivedCents: centsSchema,
  unpaidCents: centsSchema,
  payStatus: z.enum(payStatuses),
  // 售后刚好抵完：应收 0 且售后 > 0
  offsetByAfter: z.boolean(),
})
export type ArCard = z.infer<typeof arCardSchema>

const arSummaryShape = {
  shippedCents: centsSchema,
  afterCents: centsSchema,
  receivedCents: centsSchema,
  unpaidCents: centsSchema,
  // 当前余额，不受日期筛选影响
  prepaidCents: centsSchema,
}

export const arCustomerSchema = z.object({
  customerId: idSchema,
  customerName: z.string(),
  enabled: z.boolean(),
  ...arSummaryShape,
})
export type ArCustomer = z.infer<typeof arCustomerSchema>

export const listArCustomers = {
  method: 'GET',
  path: '/finance/customers',
  grants: ['finance'],
  query: pageQuerySchema.extend({ q: z.string().trim().optional() }),
  response: pageSchema(arCustomerSchema),
  errors: [],
} as const satisfies Endpoint

export const getArCustomer = {
  method: 'GET',
  path: '/finance/customers/:id',
  grants: ['finance'],
  params: idParamsSchema,
  // 按出货日期筛（默认全部）：对账格按区间里的发货单算，预收照常是当前余额
  query: pageQuerySchema
    .extend({ status: z.enum(payStatuses).optional(), ...dateRangeShape })
    .superRefine(checkDateRange),
  // 列表级 actions ⊆ registerReceipt、allocate
  response: countedPageSchema(arCardSchema, payStatuses).extend({
    customerId: idSchema,
    customerName: z.string(),
    ...arSummaryShape,
    refunds: z.array(refundSchema),
  }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 登记收款、核销预收表单：这个客户全部有未收的发货单（出货日期升序）和可用预收
export const listUnpaidOrders = {
  method: 'GET',
  path: '/finance/customers/:id/unpaid-orders',
  grants: ['finance'],
  params: idParamsSchema,
  response: z.object({
    ledgerToken: ledgerTokenSchema,
    prepaidCents: centsSchema,
    items: z.array(arCardSchema),
  }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint

// 生效的核销：售后后来冲减应收时，生效金额按登记顺序重算，超出部分回到这笔收款的预收
export const allocationSchema = z.object({
  ...allocationHistoryShape,
  receiptId: idSchema,
  receiptNo: z.string(),
  orderId: idSchema,
  orderNo: z.string(),
})
export type Allocation = z.infer<typeof allocationSchema>

export const arOrderSchema = arCardSchema.extend({
  customerId: idSchema,
  // 已处理的售后（项 actions ⊆ voidAfter）
  afters: z.array(afterCardSchema),
  allocations: z.array(allocationSchema),
})
export type ArOrder = z.infer<typeof arOrderSchema>

export const getArOrder = {
  method: 'GET',
  path: '/finance/ar-orders/:id',
  grants: ['finance'],
  params: idParamsSchema,
  response: arOrderSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
