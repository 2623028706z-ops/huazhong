import * as z from 'zod'
import { copy } from '../copy.ts'
import {
  idSchema,
  requiredIdSchema,
  requiredTextSchema,
  versionSchema,
  businessDateSchema,
} from '../rules.ts'
import { actionSchema } from './actions.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema, pageQuerySchema, pageSchema } from './page.ts'
import { inventoryItemSchema, inventoryQuerySchema, materialCategorySchema } from './inventory.ts'

const fields = {
  code: z.string().trim(),
  name: requiredTextSchema(copy.finance.materialNameRequired),
  categoryId: requiredIdSchema(copy.catalog.categoryRequired),
  unit: requiredTextSchema(copy.catalog.unitRequired),
  enabled: z.boolean(),
}
const materialSchema = z.object({
  id: idSchema,
  version: versionSchema,
  code: z.string(),
  name: z.string(),
  categoryId: idSchema,
  categoryName: z.string(),
  unit: z.string(),
  enabled: z.boolean(),
})
export type Material = z.infer<typeof materialSchema>
export const materialBatchSchema = z.object({
  id: idSchema,
  inDate: businessDateSchema,
  qty: z.number().int().positive(),
  leftQty: z.number().int().nonnegative(),
  ageDays: z.number().int().nonnegative(),
})
export const getMaterial = {
  method: 'GET',
  path: '/materials/:id',
  grants: ['warehouse', 'purchase', 'sales'],
  params: idParamsSchema,
  response: materialSchema.extend({
    stockQty: z.number().int().nonnegative(),
    batches: z.array(materialBatchSchema),
    oldestAgeDays: z.number().int().nonnegative().nullable(),
    aged: z.boolean(),
    // 仓库：edit 放抬头卡、stockIn 放灰字；stockOut/reportLoss 在底栏，均携带这种花材。
    actions: z.array(actionSchema),
  }),
  errors: ['NOT_FOUND'],
} as const satisfies Endpoint
export const listMaterials = {
  method: 'GET',
  path: '/materials',
  grants: ['warehouse', 'purchase', 'sales'],
  query: inventoryQuerySchema.extend({ enabled: z.enum(['true', 'false']).optional() }),
  response: pageSchema(materialSchema).extend({ nextCode: z.string() }),
  errors: [],
} as const satisfies Endpoint
export const createMaterial = {
  method: 'POST',
  path: '/materials',
  grants: ['warehouse'],
  body: z.object(fields),
  response: materialSchema,
  errors: ['NOT_FOUND'],
  idempotent: true,
} as const satisfies Endpoint
export const updateMaterial = {
  method: 'PATCH',
  path: '/materials/:id',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: z.object({
    ...fields,
    code: requiredTextSchema(copy.finance.materialCodeRequired),
    version: versionSchema,
  }),
  response: materialSchema,
  errors: ['NOT_FOUND', 'STALE', 'BUSINESS_RULE'],
} as const satisfies Endpoint
const categoryBody = z.object({
  name: requiredTextSchema(copy.catalog.categoryNameRequired),
  sort: z.number().int(),
})
export const createMaterialCategory = {
  method: 'POST',
  path: '/material-categories',
  grants: ['warehouse'],
  body: categoryBody,
  response: materialCategorySchema,
  errors: [],
  idempotent: true,
} as const satisfies Endpoint
export const updateMaterialCategory = {
  method: 'PATCH',
  path: '/material-categories/:id',
  grants: ['warehouse'],
  params: idParamsSchema,
  body: categoryBody,
  response: materialCategorySchema,
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
export const supplierMaterials = {
  method: 'GET',
  path: '/supplier/materials',
  grants: ['supplier'],
  query: pageQuerySchema.extend({ q: z.string().trim().optional() }),
  response: pageSchema(materialSchema.pick({ id: true, name: true, unit: true })),
  errors: [],
} as const satisfies Endpoint
export const warehouseStock = {
  method: 'GET',
  path: '/warehouse/stock',
  grants: ['warehouse'],
  query: inventoryQuerySchema.extend({ aged: z.stringbool().optional() }),
  response: pageSchema(
    inventoryItemSchema.extend({
      batches: z.array(materialBatchSchema),
      oldestAgeDays: z.number().int().nonnegative().nullable(),
      aged: z.boolean(),
      actions: z.array(actionSchema),
    }),
  ),
  errors: [],
} as const satisfies Endpoint
