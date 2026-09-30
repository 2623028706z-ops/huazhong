// 只在接口测试里挂载的专用接口：验证公共层（权限、错误、事务、幂等、STALE、发号、分页、推送）。
// 和正式接口走同一套 @Route / 守卫 / 过滤器；不在 shared 的正式契约里（08 章）
import {
  appError,
  pageQuerySchema,
  pageSchema,
  idSchema,
  type Endpoint,
  type Topic,
} from '@huazhong/shared'
import { Controller, Inject, Module } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import * as z from 'zod'
import type { Db } from '../../db/client.ts'
import { accounts, customers, operationLogs, stores } from '../../db/schema/index.ts'
import { DB } from '../../src/common/db.ts'
import { pageOf } from '../../src/common/domain/cursor.ts'
import type { Viewer } from '../../src/common/domain/viewer.ts'
import { CurrentViewer, Input, Route, type ParsedInput } from '../../src/common/endpoint.ts'
import { beforeCursor } from '../../src/common/page.ts'
import { found, ownStoreId } from '../../src/common/scope.ts'
import { updateVersioned } from '../../src/common/versioned.ts'
import { WriteService } from '../../src/common/write.service.ts'

const okSchema = z.object({ ok: z.literal(true) })
const idParams = z.object({ id: idSchema })

export const fixtures = {
  salesOnly: {
    method: 'GET',
    path: '/test/sales-only',
    grants: ['sales'],
    response: okSchema,
    errors: [],
  },
  staffOnly: {
    method: 'GET',
    path: '/test/staff-only',
    grants: ['staff'],
    response: okSchema,
    errors: [],
  },
  boom: { method: 'GET', path: '/test/boom', grants: 'any', response: okSchema, errors: [] },
  undeclared: {
    method: 'GET',
    path: '/test/undeclared',
    grants: 'any',
    response: okSchema,
    errors: [],
  },
  badResponse: {
    method: 'GET',
    path: '/test/bad-response',
    grants: 'any',
    response: okSchema,
    errors: [],
  },
  extraField: {
    method: 'GET',
    path: '/test/extra-field',
    grants: 'any',
    response: okSchema,
    errors: [],
  },
  store: {
    method: 'GET',
    path: '/test/stores/:id',
    grants: ['sales', 'store'],
    params: idParams,
    response: z.object({ id: idSchema, name: z.string() }),
    errors: ['NOT_FOUND'],
  },
  validate: {
    method: 'POST',
    path: '/test/validate',
    grants: 'any',
    body: z.object({
      lines: z.array(
        z.object({ qty: z.number().int().positive({ error: '数量须为大于 0 的整数' }) }),
      ),
    }),
    response: okSchema,
    errors: [],
  },
  createCustomer: {
    method: 'POST',
    path: '/test/customers',
    grants: ['sales'],
    body: z.object({ name: z.string().min(1), failAfterLog: z.boolean().default(false) }),
    response: z.object({ id: idSchema, no: z.string() }),
    errors: [],
    idempotent: true,
  },
  otherCreate: {
    method: 'POST',
    path: '/test/other',
    grants: ['sales'],
    response: okSchema,
    errors: [],
    idempotent: true,
  },
  noLog: { method: 'POST', path: '/test/no-log', grants: 'any', response: okSchema, errors: [] },
  rename: {
    method: 'PATCH',
    path: '/test/accounts/:id',
    grants: ['admin'],
    params: idParams,
    body: z.object({ version: z.number().int().positive(), name: z.string().min(1) }),
    response: z.object({ version: z.number().int() }),
    errors: ['STALE'],
  },
  disable: {
    method: 'POST',
    path: '/test/accounts/:id/disable',
    grants: ['admin'],
    params: idParams,
    response: okSchema,
    errors: [],
  },
  notify: {
    method: 'POST',
    path: '/test/notify',
    grants: ['admin'],
    body: z.object({
      topic: z.string(),
      version: z.number().int().nullable().default(null),
      storeIds: z.array(z.string()).default([]),
      supplierIds: z.array(z.string()).default([]),
    }),
    response: okSchema,
    errors: [],
  },
  logs: {
    method: 'GET',
    path: '/test/logs',
    grants: 'any',
    query: pageQuerySchema,
    response: pageSchema(z.object({ id: idSchema, action: z.string() })),
    errors: [],
  },
} as const satisfies Record<string, Endpoint>

const OK = { ok: true } as const

@Controller()
class FixtureController {
  constructor(
    private readonly write: WriteService,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Route(fixtures.salesOnly)
  salesOnly() {
    return Promise.resolve(OK)
  }

  @Route(fixtures.staffOnly)
  staffOnly() {
    return Promise.resolve(OK)
  }

  @Route(fixtures.boom)
  boom(): Promise<typeof OK> {
    return Promise.reject(new Error('secret stack detail'))
  }

  // BUSINESS_RULE 没在这个接口的 errors 里声明：测试环境应变成 INTERNAL
  @Route(fixtures.undeclared)
  undeclared(): Promise<typeof OK> {
    return Promise.reject(appError.businessRule('not declared in contract'))
  }

  @Route(fixtures.badResponse)
  badResponse() {
    return Promise.resolve({ ok: 'yes' } as unknown as typeof OK)
  }

  @Route(fixtures.extraField)
  extraField() {
    const withExtra = { ok: true as const, secret: 'x' }
    return Promise.resolve(withExtra)
  }

  @Route(fixtures.store)
  async store(@CurrentViewer() viewer: Viewer, @Input() input: ParsedInput<typeof fixtures.store>) {
    const own = ownStoreId(viewer)
    const id = Number(input.params.id)
    const [row] = await this.db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(own === null ? eq(stores.id, id) : and(eq(stores.id, id), eq(stores.id, own)))
    const store = found(row)
    return { id: String(store.id), name: store.name }
  }

  @Route(fixtures.validate)
  validate(@Input() _input: ParsedInput<typeof fixtures.validate>) {
    return Promise.resolve(OK)
  }

  @Route(fixtures.createCustomer)
  createCustomer(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof fixtures.createCustomer>,
  ) {
    const idempotency = { endpoint: fixtures.createCustomer, key: input.idempotencyKey }
    return this.write.run(
      viewer,
      async (ctx) => {
        const no = await ctx.nextDocNo('SO')
        const [row] = await ctx.tx
          .insert(customers)
          .values({ name: input.body.name, createdBy: viewer.accountId })
          .returning({ id: customers.id })
        if (!row) throw new Error('insert failed')
        await ctx.log({
          module: 'sales',
          kind: 'customer',
          action: 'create',
          targetType: 'customer',
          targetId: row.id,
          targetLabel: input.body.name,
        })
        if (input.body.failAfterLog) throw new Error('fail after log')
        return { id: String(row.id), no }
      },
      idempotency,
    )
  }

  @Route(fixtures.otherCreate)
  otherCreate(
    @CurrentViewer() viewer: Viewer,
    @Input() input: ParsedInput<typeof fixtures.otherCreate>,
  ) {
    return this.write.run(
      viewer,
      async (ctx) => {
        await ctx.log({
          module: 'sales',
          kind: 'other',
          action: 'create',
          targetType: 'other',
          targetId: null,
          targetLabel: '-',
        })
        return OK
      },
      { endpoint: fixtures.otherCreate, key: input.idempotencyKey },
    )
  }

  @Route(fixtures.noLog)
  noLog(@CurrentViewer() viewer: Viewer) {
    return this.write.run(viewer, () => Promise.resolve(OK))
  }

  @Route(fixtures.rename)
  rename(@CurrentViewer() viewer: Viewer, @Input() input: ParsedInput<typeof fixtures.rename>) {
    const id = Number(input.params.id)
    return this.write.run(viewer, async (ctx) => {
      const row = await updateVersioned({
        table: accounts,
        id,
        version: input.body.version,
        update: ({ where, version }) =>
          ctx.tx.update(accounts).set({ name: input.body.name, version }).where(where).returning(),
        onStale: async () => {
          const [latest] = await ctx.tx
            .select({ name: accounts.name, version: accounts.version })
            .from(accounts)
            .where(eq(accounts.id, id))
          return { message: 'changed by someone else', latest }
        },
      })
      await ctx.log({
        module: 'sales',
        kind: 'account',
        action: 'rename',
        targetType: 'account',
        targetId: id,
        targetLabel: row.name,
      })
      return { version: row.version }
    })
  }

  @Route(fixtures.disable)
  disable(@CurrentViewer() viewer: Viewer, @Input() input: ParsedInput<typeof fixtures.disable>) {
    const id = Number(input.params.id)
    return this.write.run(viewer, async (ctx) => {
      await ctx.tx.update(accounts).set({ enabled: false }).where(eq(accounts.id, id))
      await ctx.log({
        module: 'sales',
        kind: 'account',
        action: 'disable',
        targetType: 'account',
        targetId: id,
        targetLabel: String(id),
      })
      ctx.notify([{ topic: `account:${String(id)}`, version: null }])
      return OK
    })
  }

  @Route(fixtures.notify)
  notify(@CurrentViewer() viewer: Viewer, @Input() input: ParsedInput<typeof fixtures.notify>) {
    const { topic, version, storeIds, supplierIds } = input.body
    return this.write.run(viewer, async (ctx) => {
      await ctx.log({
        module: 'sales',
        kind: 'test',
        action: 'notify',
        targetType: 'test',
        targetId: null,
        targetLabel: topic,
      })
      ctx.notify([{ topic: topic as Topic, version }], { storeIds, supplierIds })
      return OK
    })
  }

  @Route(fixtures.logs)
  async logs(@Input() input: ParsedInput<typeof fixtures.logs>) {
    const { limit, cursor } = input.query
    const rows = await this.db
      .select({
        id: operationLogs.id,
        action: operationLogs.action,
        createdAt: operationLogs.createdAt,
      })
      .from(operationLogs)
      .where(beforeCursor(operationLogs.createdAt, operationLogs.id, cursor))
      .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
      .limit(limit + 1)
    const page = pageOf(rows, limit, (r) => [r.createdAt.toISOString(), r.id])
    return {
      items: page.items.map((r) => ({ id: String(r.id), action: r.action })),
      nextCursor: page.nextCursor,
      actions: [],
    }
  }
}

@Module({ controllers: [FixtureController] })
export class FixtureModule {}
