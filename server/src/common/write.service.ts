// 写操作的公共层：事务、操作日志、实时通知、幂等、发号都在这里统一处理，业务代码不重复写（00 章第 6 节）
import {
  appError,
  copy,
  type DocPrefix,
  type Endpoint,
  type ModuleKey,
  type Topic,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../db/client.ts'
import { docSequences, idempotencyKeys, operationLogs } from '../../db/schema/index.ts'
import {
  CHANGES_CHANNEL,
  CHANGES_PAYLOAD_MAX_BYTES,
  type ChangeScope,
  type ChangesPayload,
} from './changes.ts'
import { Clock } from './clock.ts'
import { DB } from './db.ts'
import { formatDocNo } from './domain/doc-no.ts'
import { actorLabelOf, type Viewer } from './domain/viewer.ts'
import { IDEMPOTENCY_HEADER } from './endpoint.ts'

interface LogEntry {
  // null = 公共（账号类操作，只有管理员能看）
  module: ModuleKey | null
  // 操作人和请求的账号不同时给：绑定微信时请求还没有账号，操作人是被绑定的账号本人
  actor?: Viewer | null
  kind: string
  action: string
  targetType: string
  targetId: number | null
  targetLabel: string
  reason?: string
  before?: unknown
  after?: unknown
}

export interface WriteContext {
  readonly tx: Tx
  readonly viewer: Viewer | null
  log(entry: LogEntry): Promise<void>
  // 事务提交后推给订阅了这些主题的连接；scope 是涉及的门店、供应商，用于服务端过滤
  notify(changes: { topic: Topic; version: number | null }[], scope?: Partial<ChangeScope>): void
  nextDocNo(prefix: DocPrefix): Promise<string>
  // 查下来发现什么都不用改（例如已经解绑过）：这次事务不写日志也不算漏
  unchanged(): void
}

class TxContext implements WriteContext {
  private logged = false
  private isUnchanged = false
  private readonly changes = new Map<Topic, number | null>()
  private readonly storeIds = new Set<string>()
  private readonly supplierIds = new Set<string>()

  constructor(
    readonly tx: Tx,
    readonly viewer: Viewer | null,
    private readonly clock: Clock,
  ) {}

  async log({ actor, ...entry }: LogEntry): Promise<void> {
    const by = actor === undefined ? this.viewer : actor
    await this.tx.insert(operationLogs).values({
      ...entry,
      reason: entry.reason ?? '',
      before: entry.before ?? null,
      after: entry.after ?? null,
      createdBy: by?.accountId ?? null,
      actorLabel: actorLabelOf(by),
    })
    this.logged = true
  }

  unchanged(): void {
    this.isUnchanged = true
  }

  notify(
    changes: { topic: Topic; version: number | null }[],
    scope: Partial<ChangeScope> = {},
  ): void {
    for (const change of changes) {
      const previous = this.changes.get(change.topic) ?? null
      this.changes.set(
        change.topic,
        previous === null ? change.version : Math.max(previous, change.version ?? 0),
      )
    }
    for (const id of scope.storeIds ?? []) this.storeIds.add(id)
    for (const id of scope.supplierIds ?? []) this.supplierIds.add(id)
  }

  async nextDocNo(prefix: DocPrefix): Promise<string> {
    const day = this.clock.today()
    const [row] = await this.tx
      .insert(docSequences)
      .values({ prefix, day, last: 1 })
      .onConflictDoUpdate({
        target: [docSequences.prefix, docSequences.day],
        set: { last: sql`${docSequences.last} + 1` },
      })
      .returning({ last: docSequences.last })
    if (!row) throw appError.internal()
    return formatDocNo(prefix, day, row.last)
  }

  // 每个写事务都要写操作日志（05 章第 1.7 节）；漏了是代码错误
  async finish(): Promise<void> {
    if (!this.logged && !this.isUnchanged)
      throw new Error('write transaction without operation log')
    if (this.changes.size === 0) return
    const payload: ChangesPayload = {
      changes: [...this.changes].map(([topic, version]) => ({ topic, version })),
      scope: { storeIds: [...this.storeIds], supplierIds: [...this.supplierIds] },
    }
    const text = JSON.stringify(payload)
    if (Buffer.byteLength(text) > CHANGES_PAYLOAD_MAX_BYTES)
      throw new Error('change payload too large')
    await this.tx.execute(sql`SELECT pg_notify(${CHANGES_CHANNEL}, ${text})`)
  }
}

interface Idempotency {
  endpoint: Endpoint
  key: string
}

type Claim = { replay: false } | { replay: true; response: unknown }

@Injectable()
export class WriteService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  // viewer 为 null 表示系统自动动作（日志操作人写「系统」）；幂等只用于有账号的新建类接口
  async run<T>(
    viewer: Viewer | null,
    work: (ctx: WriteContext) => Promise<T>,
    idempotency?: Idempotency,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      if (idempotency && viewer) {
        const claim = await claimKey(tx, viewer.accountId, idempotency)
        if (claim.replay) return claim.response as T
      }
      const ctx = new TxContext(tx, viewer, this.clock)
      const result = await work(ctx)
      await ctx.finish()
      if (idempotency && viewer) {
        await tx
          .update(idempotencyKeys)
          .set({ response: result })
          .where(
            and(
              eq(idempotencyKeys.accountId, viewer.accountId),
              eq(idempotencyKeys.key, idempotency.key),
            ),
          )
      }
      return result
    })
  }
}

// 先插入占住键：并发的同一键会等前一个事务结束（提交了就返回它的结果，回滚了就轮到自己）
async function claimKey(tx: Tx, accountId: number, idempotency: Idempotency): Promise<Claim> {
  const endpoint = `${idempotency.endpoint.method} ${idempotency.endpoint.path}`
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({ accountId, key: idempotency.key, endpoint })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key })
  if (inserted.length > 0) return { replay: false }
  const [existing] = await tx
    .select()
    .from(idempotencyKeys)
    .where(and(eq(idempotencyKeys.accountId, accountId), eq(idempotencyKeys.key, idempotency.key)))
  // 同一个键用在了别的接口上：前端每次打开表单都会生成新键，正常操作碰不到
  if (!existing || existing.endpoint !== endpoint) {
    throw appError.validation({ [IDEMPOTENCY_HEADER]: copy.error.validationFallback })
  }
  return { replay: true, response: existing.response }
}
