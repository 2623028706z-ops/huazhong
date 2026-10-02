import { appError, contract, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'
import { materialCategories, materials } from '../../../db/schema/index.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService, type WriteContext } from '../../common/write.service.ts'
import { MaterialReads, nextMaterialCode } from './material-reads.ts'

type In<K extends keyof typeof contract> = ParsedInput<(typeof contract)[K]>['body']
const UNIQUE_FIELDS = { materials_code_unique: { code: copy.finance.materialCodeTaken } }
function materialLog(row: { id: string; name: string }, action: string) {
  return {
    module: 'warehouse' as const,
    kind: copy.log.kind.material,
    action,
    targetType: 'materials',
    targetId: Number(row.id),
    targetLabel: row.name,
  }
}
function materialView(row: {
  name: string
  code: string
  categoryName: string
  unit: string
  enabled: boolean
}) {
  return {
    [copy.field.name]: row.name,
    [copy.field.code]: row.code,
    [copy.field.category]: row.categoryName,
    [copy.field.unit]: row.unit,
    [copy.field.status]: row.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}
async function checkCategory(ctx: WriteContext, id: string) {
  found(
    (
      await ctx.tx
        .select({ id: materialCategories.id })
        .from(materialCategories)
        .where(eq(materialCategories.id, Number(id)))
    )[0],
  )
}
function notifyMaterial(ctx: WriteContext) {
  ctx.notify([
    { topic: 'stock', version: null },
    { topic: 'demand', version: null },
  ])
}
@Injectable()
export class MaterialWrites {
  constructor(
    private readonly writes: WriteService,
    private readonly reads: MaterialReads,
  ) {}
  create(viewer: Viewer, input: In<'createMaterial'>, key: string) {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await checkCategory(ctx, input.categoryId)
            // 同一事务分配编码；客户端看到的默认编码只是建议值。
            await ctx.tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended('material-code', 0))`,
            )
            const code = input.code || (await nextMaterialCode(ctx.tx))
            const [row] = await ctx.tx
              .insert(materials)
              .values({
                ...input,
                code,
                categoryId: Number(input.categoryId),
                createdBy: viewer.accountId,
              })
              .returning()
            const item = await this.reads.item(ctx.tx, found(row).id)
            await ctx.log({
              ...materialLog(item, copy.log.action.createMaterial),
              after: materialView(item),
            })
            notifyMaterial(ctx)
            return item
          },
          { endpoint: contract.createMaterial, key },
        ),
      UNIQUE_FIELDS,
    )
  }
  update(viewer: Viewer, id: number, input: In<'updateMaterial'>) {
    return guardUnique(
      () =>
        this.writes.run(viewer, async (ctx) => {
          found(
            (await ctx.tx.select().from(materials).where(eq(materials.id, id)).for('update'))[0],
          )
          const before = await this.reads.item(ctx.tx, id)
          if (before.version !== input.version)
            throw appError.stale(copy.finance.materialStale, before)
          const same =
            before.name === input.name &&
            before.code === input.code &&
            before.categoryId === input.categoryId &&
            before.unit === input.unit &&
            before.enabled === input.enabled
          if (same) throw appError.businessRule(copy.error.noChange)
          await checkCategory(ctx, input.categoryId)
          await ctx.tx
            .update(materials)
            .set({
              ...input,
              categoryId: Number(input.categoryId),
              version: sql`${materials.version} + 1`,
            })
            .where(eq(materials.id, id))
          const after = await this.reads.item(ctx.tx, id)
          await ctx.log({
            ...materialLog(after, copy.log.action.updateMaterial),
            before: materialView(before),
            after: materialView(after),
          })
          notifyMaterial(ctx)
          return after
        }),
      UNIQUE_FIELDS,
    )
  }
}
