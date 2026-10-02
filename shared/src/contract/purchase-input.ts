import * as z from 'zod'
import { copy } from '../copy.ts'
import { centsInputSchema, positiveIntSchema, requiredIdSchema, versionSchema } from '../rules.ts'
import { checkDistinct } from './page.ts'

const poLineInput = z.object({
  materialId: requiredIdSchema(copy.finance.materialRequired),
  qty: positiveIntSchema(copy.finance.poQtyInvalid),
  priceCents: centsInputSchema(copy.finance.poPriceRequired),
})
function distinctMaterials(value: { lines: { materialId: string }[] }, ctx: z.RefinementCtx) {
  checkDistinct(ctx, {
    items: value.lines,
    keyOf: (line) => line.materialId,
    message: copy.finance.materialDuplicate,
    path: ['lines', 'materialId'],
  })
}
export const poCreateSchema = z
  .object({
    supplierId: requiredIdSchema(copy.finance.poSupplierRequired),
    note: z.string().trim(),
    lines: z.array(poLineInput).min(1, { error: copy.finance.poLinesRequired }),
  })
  .superRefine(distinctMaterials)
export const poUpdateSchema = poCreateSchema.safeExtend({
  version: versionSchema,
  reason: z.string().trim(),
})
const inviteLines = z
  .array(
    z.object({
      materialId: requiredIdSchema(copy.finance.materialRequired),
      needQty: positiveIntSchema(copy.finance.inviteQtyInvalid),
    }),
  )
  .min(1, { error: copy.finance.poLinesRequired })
export const inviteCreateSchema = z
  .object({
    supplierId: requiredIdSchema(copy.finance.poSupplierRequired),
    lines: inviteLines,
  })
  .superRefine(distinctMaterials)
export const inviteUpdateSchema = z
  .object({
    version: versionSchema,
    lines: inviteLines,
  })
  .superRefine(distinctMaterials)
export const supplySchema = z
  .object({
    version: versionSchema,
    lines: z.array(
      poLineInput.extend({
        qty: positiveIntSchema(copy.finance.supplyQtyInvalid),
      }),
    ),
  })
  .superRefine(distinctMaterials)
