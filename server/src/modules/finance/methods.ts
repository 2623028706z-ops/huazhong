// 收付款方式（05 章第 10 节）：收款、付款各一份，财务新增、启用 / 停用，每份至少保留一种启用
import {
  appError,
  contract,
  copy,
  labels,
  type MethodKind,
  type OutputOf,
  type PaymentMethod,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { paymentMethods } from '../../../db/schema/index.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { found } from '../../common/scope.ts'
import { guardUnique } from '../../common/unique.ts'
import { WriteService } from '../../common/write.service.ts'

const NAME_FIELDS = { payment_methods_kind_name_unique: { name: copy.finance.methodNameTaken } }

type MethodRow = typeof paymentMethods.$inferSelect

function toMethod(row: MethodRow): PaymentMethod {
  return {
    id: String(row.id),
    kind: row.kind,
    name: row.name,
    enabled: row.enabled,
    sort: row.sort,
  }
}

function methodLog(row: MethodRow, action: string) {
  return {
    module: 'finance' as const,
    kind: copy.log.kind.method,
    action,
    targetType: 'payment_methods',
    targetId: row.id,
    targetLabel: `${labels.methodKind[row.kind]}${copy.separator}${row.name}`,
  }
}

@Injectable()
export class MethodService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly writes: WriteService,
  ) {}

  async list(kind: MethodKind | undefined): Promise<OutputOf<typeof contract.listMethods>> {
    const rows = await this.db
      .select()
      .from(paymentMethods)
      .where(kind === undefined ? undefined : eq(paymentMethods.kind, kind))
      .orderBy(asc(paymentMethods.kind), asc(paymentMethods.sort), asc(paymentMethods.id))
    return { items: rows.map(toMethod), nextCursor: null, actions: [] }
  }

  // 新增的排在同一份的最后
  create(
    viewer: Viewer,
    input: { kind: MethodKind; name: string },
    idempotencyKey: string,
  ): Promise<PaymentMethod> {
    return guardUnique(
      () =>
        this.writes.run(
          viewer,
          async (ctx) => {
            const [taken] = await ctx.tx
              .select({ id: paymentMethods.id })
              .from(paymentMethods)
              .where(and(eq(paymentMethods.kind, input.kind), eq(paymentMethods.name, input.name)))
            if (taken) throw appError.validation({ name: copy.finance.methodNameTaken })
            const [last] = await ctx.tx
              .select({ sort: sql<number>`coalesce(max(${paymentMethods.sort}), -1)::int` })
              .from(paymentMethods)
              .where(eq(paymentMethods.kind, input.kind))
            const [row] = await ctx.tx
              .insert(paymentMethods)
              .values({ ...input, sort: (last?.sort ?? -1) + 1, createdBy: viewer.accountId })
              .returning()
            if (!row) throw appError.internal()
            await ctx.log(methodLog(row, copy.log.action.createMethod))
            return toMethod(row)
          },
          { endpoint: contract.createMethod, key: idempotencyKey },
        ),
      NAME_FIELDS,
    )
  }

  // 锁住同一份的全部方式再判断「至少一种启用」，并发停用最后两种不会都成功
  setEnabled(viewer: Viewer, id: number, enabled: boolean): Promise<PaymentMethod> {
    return this.writes.run(viewer, async (ctx) => {
      const [target] = await ctx.tx.select().from(paymentMethods).where(eq(paymentMethods.id, id))
      const kind = found(target).kind
      const rows = await ctx.tx
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.kind, kind))
        .orderBy(asc(paymentMethods.id))
        .for('update')
      const row = found(rows.find((item) => item.id === id))
      if (row.enabled === enabled) throw appError.businessRule(copy.error.noChange)
      if (!enabled && rows.filter((item) => item.enabled && item.id !== id).length === 0) {
        throw appError.businessRule(copy.finance.lastMethod)
      }
      const [saved] = await ctx.tx
        .update(paymentMethods)
        .set({ enabled })
        .where(eq(paymentMethods.id, id))
        .returning()
      if (!saved) throw appError.internal()
      const action = enabled ? copy.log.action.enableMethod : copy.log.action.disableMethod
      await ctx.log(methodLog(saved, action))
      return toMethod(saved)
    })
  }
}
