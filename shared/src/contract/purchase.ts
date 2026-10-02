// 采购与供应商端：阶段 4 开始实现的接口。
import * as z from 'zod'
import { apStatuses, inviteStatuses, poStatuses } from '../enums.ts'
import { copy } from '../copy.ts'
import {
  businessDateSchema,
  centsSchema,
  idSchema,
  requiredTextSchema,
  timestampSchema,
  unitTotalSchema,
  versionSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import { paymentAllocationSchema, externalAllocationSchema } from './ledger.ts'
import type { Endpoint } from './endpoint.ts'
import {
  checkDateRange,
  countedPageSchema,
  dateRangeShape,
  idParamsSchema,
  pageQuerySchema,
} from './page.ts'
import {
  poCreateSchema,
  poUpdateSchema,
  inviteCreateSchema,
  inviteUpdateSchema,
  supplySchema,
} from './purchase-input.ts'

const actions = z.array(actionSchema)
const recordShape = { id: idSchema, actorLabel: z.string(), createdAt: timestampSchema }
export const poCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  orderDate: businessDateSchema,
  supplierId: idSchema,
  supplierName: z.string(),
  buyerName: z.string(),
  status: z.enum(poStatuses),
  units: z.array(unitTotalSchema),
  amountCents: centsSchema,
  payableCents: centsSchema,
  paidCents: centsSchema,
  unpaidCents: centsSchema,
  apStatus: z.enum(apStatuses),
  changed: z.boolean(),
  repriced: z.boolean(),
  allReturned: z.boolean(),
  actions,
  lockedReason: z.string().nullable(),
})
export type PoCard = z.infer<typeof poCardSchema>
export const poDetailSchema = poCardSchema.extend({
  note: z.string().nullable(),
  recvNote: z.string().nullable(),
  inviteId: idSchema.nullable(),
  inviteNo: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  voidReason: z.string().nullable(),
  voidedAt: timestampSchema.nullable(),
  receivedAt: timestampSchema.nullable(),
  receivedBy: z.string().nullable(),
  lines: z.array(
    z.object({
      id: idSchema,
      materialId: idSchema,
      name: z.string(),
      unit: z.string(),
      qty: z.number().int().positive(),
      orderPriceCents: centsSchema,
      priceCents: centsSchema,
      receivedQty: z.number().int().nonnegative().nullable(),
      returnedQty: z.number().int().nonnegative(),
      maxReturnQty: z.number().int().nonnegative().nullable(),
    }),
  ),
  changes: z.array(z.object({ ...recordShape, reason: z.string(), items: z.array(z.string()) })),
  priceChanges: z.array(
    z.object({
      ...recordShape,
      reason: z.string(),
      items: z.array(z.object({ name: z.string(), fromCents: centsSchema, toCents: centsSchema })),
    }),
  ),
  returns: z.array(
    z.object({
      ...recordShape,
      items: z.array(z.object({ name: z.string(), qty: z.number().int().positive() })),
    }),
  ),
  notice: z.string().nullable(),
  allocations: z.array(paymentAllocationSchema),
})
export type PoDetail = z.infer<typeof poDetailSchema>
export const supplierPoDetailSchema = poDetailSchema.extend({
  allocations: z.array(externalAllocationSchema),
})
export type SupplierPoDetail = z.infer<typeof supplierPoDetailSchema>
export const poQuerySchema = pageQuerySchema
  .extend({
    status: z.enum(poStatuses).optional(),
    supplierId: idSchema.optional(),
    ...dateRangeShape,
  })
  .superRefine(checkDateRange)
export const listPurchaseOrders = {
  method: 'GET',
  path: '/purchase-orders',
  grants: ['purchase', 'warehouse', 'finance'],
  query: poQuerySchema,
  response: countedPageSchema(poCardSchema, poStatuses),
  errors: [],
} as const satisfies Endpoint
export const getPurchaseOrder = {
  method: 'GET',
  path: '/purchase-orders/:id',
  grants: ['purchase', 'warehouse', 'finance'],
  params: idParamsSchema,
  response: poDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const createPurchaseOrder = {
  method: 'POST',
  path: '/purchase-orders',
  grants: ['purchase'],
  body: poCreateSchema,
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const updatePurchaseOrder = {
  method: 'PUT',
  path: '/purchase-orders/:id',
  grants: ['purchase'],
  params: idParamsSchema,
  body: poUpdateSchema,
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const cancelPurchaseOrder = {
  method: 'POST',
  path: '/purchase-orders/:id/cancel',
  grants: ['purchase'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.rework.reasonRequired),
  }),
  response: poDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const inviteQuerySchema = pageQuerySchema.extend({
  status: z.enum(inviteStatuses).optional(),
  supplierId: idSchema.optional(),
})
export const inviteCardSchema = z.object({
  id: idSchema,
  no: z.string(),
  version: versionSchema,
  inviteDate: businessDateSchema,
  supplierId: idSchema,
  supplierName: z.string(),
  buyerName: z.string(),
  status: z.enum(inviteStatuses),
  units: z.array(unitTotalSchema),
  materialNames: z.array(z.string()),
  purchaseOrderId: idSchema.nullable(),
  purchaseOrderNo: z.string().nullable(),
  purchaseOrderStatus: z.enum(poStatuses).nullable(),
  actions,
  lockedReason: z.string().nullable(),
})
export type InviteCard = z.infer<typeof inviteCardSchema>
export const inviteDetailSchema = inviteCardSchema.extend({
  lines: z.array(
    z.object({
      id: idSchema,
      materialId: idSchema,
      name: z.string(),
      unit: z.string(),
      enabled: z.boolean(),
      needQty: z.number().int().positive(),
    }),
  ),
  supply: z.array(
    z.object({
      materialId: idSchema,
      name: z.string(),
      unit: z.string(),
      qty: z.number().int().positive(),
      priceCents: centsSchema,
    }),
  ),
  cancelNote: z.string().nullable(),
  cancelledAt: timestampSchema.nullable(),
  submittedAt: timestampSchema.nullable(),
})
export type InviteDetail = z.infer<typeof inviteDetailSchema>
export const listInvites = {
  method: 'GET',
  path: '/invites',
  grants: ['purchase'],
  query: inviteQuerySchema,
  response: countedPageSchema(inviteCardSchema, inviteStatuses),
  errors: [],
} as const satisfies Endpoint
export const getInvite = {
  method: 'GET',
  path: '/invites/:id',
  grants: ['purchase'],
  params: idParamsSchema,
  response: inviteDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const createInvite = {
  method: 'POST',
  path: '/invites',
  grants: ['purchase'],
  body: inviteCreateSchema,
  response: inviteDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const updateInvite = {
  method: 'PUT',
  path: '/invites/:id',
  grants: ['purchase'],
  params: idParamsSchema,
  body: inviteUpdateSchema,
  response: inviteDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const cancelInvite = {
  method: 'POST',
  path: '/invites/:id/cancel',
  grants: ['purchase'],
  params: idParamsSchema,
  body: z.object({ version: versionSchema }),
  response: inviteDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const shareInvite = {
  method: 'POST',
  path: '/invites/:id/share',
  grants: ['purchase'],
  params: idParamsSchema,
  response: z.object({ path: z.string(), title: z.string(), imageUrl: z.string() }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const supplierInvites = {
  method: 'GET',
  path: '/supplier/invites',
  grants: ['supplier'],
  query: inviteQuerySchema.omit({ supplierId: true }),
  response: countedPageSchema(inviteCardSchema, inviteStatuses),
  errors: [],
} as const satisfies Endpoint
export const supplierInvite = {
  method: 'GET',
  path: '/supplier/invites/:id',
  grants: ['supplier'],
  params: idParamsSchema,
  response: inviteDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const resolveSupplierInvite = {
  method: 'POST',
  path: '/supplier/invites/resolve',
  grants: 'any',
  body: z.object({ id: idSchema, sig: z.string() }),
  response: z.object({ inviteId: idSchema }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const submitSupplierInvite = {
  method: 'POST',
  path: '/supplier/invites/:id/submit',
  grants: ['supplier'],
  params: idParamsSchema,
  body: supplySchema,
  response: z.object({ invite: inviteDetailSchema, purchaseOrder: supplierPoDetailSchema }),
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
  idempotent: true,
} as const satisfies Endpoint
export const supplierPurchaseOrders = {
  method: 'GET',
  path: '/supplier/purchase-orders',
  grants: ['supplier'],
  query: poQuerySchema,
  response: countedPageSchema(poCardSchema, poStatuses),
  errors: [],
} as const satisfies Endpoint
export const supplierPurchaseOrder = {
  method: 'GET',
  path: '/supplier/purchase-orders/:id',
  grants: ['supplier'],
  params: idParamsSchema,
  response: supplierPoDetailSchema,
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const supplierUpdatePurchaseOrder = {
  method: 'PUT',
  path: '/supplier/purchase-orders/:id',
  grants: ['supplier'],
  params: idParamsSchema,
  body: supplySchema.safeExtend({ reason: z.string().trim().default('') }),
  response: supplierPoDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const supplierCancelPurchaseOrder = {
  method: 'POST',
  path: '/supplier/purchase-orders/:id/cancel',
  grants: ['supplier'],
  params: idParamsSchema,
  body: z.object({
    version: versionSchema,
    reason: requiredTextSchema(copy.rework.reasonRequired),
  }),
  response: supplierPoDetailSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export { demandQuerySchema, listPurchaseDemand, listDemandSources } from './purchase-demand.ts'
