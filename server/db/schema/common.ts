// 操作日志、发号、幂等键（04 章第 3.3、3.4 节）
import { bigint, date, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { accountRef, idColumn, timestamptz } from './columns.ts'
import { moduleKey } from './enums.ts'

// 只插入，不更新、不删除；自动动作的 created_by 为空；账号类操作的 module 为空（公共，只有管理员能看）
export const operationLogs = pgTable(
  'operation_logs',
  {
    id: idColumn(),
    createdAt: timestamptz().notNull().defaultNow(),
    createdBy: accountRef(),
    module: moduleKey(),
    kind: text().notNull(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: bigint({ mode: 'number' }),
    targetLabel: text().notNull(),
    actorLabel: text().notNull(),
    reason: text().notNull().default(''),
    before: jsonb().$type<unknown>(),
    after: jsonb().$type<unknown>(),
  },
  (t) => [
    index('operation_logs_module_time').on(t.module, t.createdAt.desc()),
    index('operation_logs_target').on(t.targetType, t.targetId),
  ],
)

export const docSequences = pgTable(
  'doc_sequences',
  {
    prefix: text().notNull(),
    day: date({ mode: 'string' }).notNull(),
    last: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.day] })],
)

// 事务一开始先插入占住键，业务写完在同一事务里填 response（04 章第 3.4 节）
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    accountId: accountRef().notNull(),
    key: text().notNull(),
    endpoint: text().notNull(),
    response: jsonb().$type<unknown>(),
    createdAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.key] }),
    // 每天按保留时间清理（jobs/cleanup）
    index('idempotency_keys_created_at').on(t.createdAt),
  ],
)
