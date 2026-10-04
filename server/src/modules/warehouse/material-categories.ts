import { appError, contract, copy, type MaterialCategory } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { materialCategories } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService } from '../../common/write.service.ts'

const UNIQUE_FIELDS = { material_categories_name_unique: { name: copy.catalog.categoryNameTaken } }
type Fields = ParsedInput<typeof contract.createMaterialCategory>['body']
function categoryView(row: typeof materialCategories.$inferSelect): MaterialCategory {
  return { id: String(row.id), name: row.name, sort: row.sort }
}
function categoryLog(row: { id: number; name: string }, action: string) {
  return {
    module: 'warehouse' as const,
    kind: copy.log.kind.category,
    action,
    targetType: 'material_categories',
    targetId: row.id,
    targetLabel: row.name,
  }
}
@Injectable()
export class MaterialCategories {
  constructor(private readonly writes: WriteService) {}
  create(viewer: Viewer, input: Fields, key: string) {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            const [row] = await ctx.tx
              .insert(materialCategories)
              .values({ ...input, createdBy: viewer.accountId })
              .returning()
            const saved = found(row)
            await ctx.log(categoryLog(saved, copy.log.action.createCategory))
            ctx.notify([{ topic: 'stock', version: null }])
            return categoryView(saved)
          },
          { endpoint: contract.createMaterialCategory, key },
        ),
      UNIQUE_FIELDS,
    )
  }
  update(viewer: Viewer, id: number, input: Fields) {
    return guardUnique(
      () =>
        this.writes.run(viewer, async (ctx) => {
          const before = found(
            (
              await ctx.tx
                .select()
                .from(materialCategories)
                .where(eq(materialCategories.id, id))
                .for('update')
            )[0],
          )
          if (before.name === input.name && before.sort === input.sort)
            throw appError.businessRule(copy.error.noChange)
          const saved = found(
            (
              await ctx.tx
                .update(materialCategories)
                .set(input)
                .where(eq(materialCategories.id, id))
                .returning()
            )[0],
          )
          await ctx.log({
            ...categoryLog(saved, copy.log.action.updateCategory),
            before: {
              [copy.field.objectName]: before.name,
              [copy.field.sort]: String(before.sort),
            },
            after: { [copy.field.objectName]: saved.name, [copy.field.sort]: String(saved.sort) },
          })
          ctx.notify([{ topic: 'stock', version: null }])
          return categoryView(saved)
        }),
      UNIQUE_FIELDS,
    )
  }
}
