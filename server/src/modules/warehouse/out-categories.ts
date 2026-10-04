import { appError, contract, copy, type OutputOf } from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { outCategories } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import { enabledAction } from '../../common/domain/actions.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import type { ParsedInput } from '../../common/endpoint.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService } from '../../common/write.service.ts'

type Fields = ParsedInput<typeof contract.createOutCategory>['body']
const uniqueFields = { out_categories_name_unique: { name: copy.stock.categoryNameTaken } }
function view(row: typeof outCategories.$inferSelect) {
  return { id: String(row.id), name: row.name, enabled: row.enabled, sort: row.sort }
}
function logView(row: Fields) {
  return {
    [copy.field.objectName]: row.name,
    [copy.field.status]: row.enabled ? copy.statusValue.enabled : copy.statusValue.disabled,
  }
}
@Injectable()
export class OutCategories {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
  ) {}
  async list(): Promise<OutputOf<typeof contract.listOutCategories>> {
    const rows = await this.db
      .select()
      .from(outCategories)
      .orderBy(asc(outCategories.sort), asc(outCategories.id))
    return { items: rows.map(view), nextCursor: null, actions: [enabledAction('create', null)] }
  }
  create(viewer: Viewer, input: Fields, key: string) {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            await ctx.tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended('out-categories', 0))`,
            )
            const rows = await ctx.tx.select().from(outCategories)
            if (!input.enabled && !rows.some((row) => row.enabled))
              throw appError.businessRule(copy.stock.keepOneEnabled)
            const row = found(
              (
                await ctx.tx
                  .insert(outCategories)
                  .values({
                    ...input,
                    sort: Math.max(0, ...rows.map((row) => row.sort)) + 1,
                    createdBy: viewer.accountId,
                  })
                  .returning()
              )[0],
            )
            await ctx.log({
              module: 'warehouse',
              kind: copy.stock.log.kindOutCategory,
              action: copy.stock.log.createOutCategory,
              targetType: 'out_categories',
              targetId: row.id,
              targetLabel: row.name,
              after: logView(input),
            })
            ctx.notify([{ topic: 'stock', version: null }])
            return view(row)
          },
          { endpoint: contract.createOutCategory, key },
        ),
      uniqueFields,
    )
  }
  update(viewer: Viewer, id: number, input: Fields) {
    return guardUnique(
      () =>
        this.writes.run(viewer, async (ctx) => {
          await ctx.tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended('out-categories', 0))`,
          )
          const rows = await ctx.tx
            .select()
            .from(outCategories)
            .orderBy(asc(outCategories.id))
            .for('update')
          const before = found(rows.find((row) => row.id === id))
          if (!input.enabled && !rows.some((row) => row.id !== id && row.enabled))
            throw appError.businessRule(copy.stock.keepOneEnabled)
          if (input.name === before.name && input.enabled === before.enabled)
            throw appError.businessRule(copy.error.noChange)
          const saved = found(
            (
              await ctx.tx
                .update(outCategories)
                .set(input)
                .where(eq(outCategories.id, id))
                .returning()
            )[0],
          )
          await ctx.log({
            module: 'warehouse',
            kind: copy.stock.log.kindOutCategory,
            action: copy.stock.log.updateOutCategory,
            targetType: 'out_categories',
            targetId: id,
            targetLabel: saved.name,
            before: logView(before),
            after: logView(saved),
          })
          ctx.notify([{ topic: 'stock', version: null }])
          return view(saved)
        }),
      uniqueFields,
    )
  }
}
