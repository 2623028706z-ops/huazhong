// 操作日志（05 章第 3 节）：管理员看全部（含公共），员工只看自己模块；前端不能改
import {
  appError,
  contract,
  type LogDetail,
  type LogItem,
  type ModuleKey,
  type OutputOf,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../../../db/client.ts'
import { operationLogs } from '../../../db/schema/index.ts'
import { BUSINESS_TIME_ZONE } from '../../common/clock.ts'
import { pageOf } from '../../common/domain/cursor.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { DB } from '../../common/db.ts'
import { beforeCursor } from '../../common/page.ts'

interface LogQuery {
  module?: ModuleKey | undefined
  from?: string | undefined
  to?: string | undefined
  cursor?: string | undefined
  limit: number
}

type LogView = Record<string, string> | null

// 能看哪些日志：管理员不限（module 为空 = 公共也在内）；员工只看自己模块，不含公共
function visibleTo(viewer: Viewer): SQL | undefined {
  if (viewer.type === 'admin') return undefined
  return inArray(operationLogs.module, [...viewer.modules])
}

// 传了模块：员工只能传自己的模块（05 章第 3 节）
function moduleFilter(viewer: Viewer, module: ModuleKey | undefined): SQL | undefined {
  if (module === undefined) return visibleTo(viewer)
  if (viewer.type !== 'admin' && !viewer.modules.includes(module)) throw appError.forbidden()
  return eq(operationLogs.module, module)
}

// 业务日期两头都含，按上海时间
function dateFilter(from: string | undefined, to: string | undefined): SQL[] {
  const conditions: SQL[] = []
  if (from !== undefined) {
    conditions.push(
      sql`${operationLogs.createdAt} >= (${from}::date)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE}`,
    )
  }
  if (to !== undefined) {
    conditions.push(
      sql`${operationLogs.createdAt} < (${to}::date + 1)::timestamp AT TIME ZONE ${BUSINESS_TIME_ZONE}`,
    )
  }
  return conditions
}

const itemColumns = {
  id: operationLogs.id,
  createdAt: operationLogs.createdAt,
  module: operationLogs.module,
  kind: operationLogs.kind,
  action: operationLogs.action,
  targetLabel: operationLogs.targetLabel,
  actorLabel: operationLogs.actorLabel,
}

interface ItemRow {
  id: number
  createdAt: Date
  module: ModuleKey | null
  kind: string
  action: string
  targetLabel: string
  actorLabel: string
}

function toItem(row: ItemRow): LogItem {
  return { ...row, id: String(row.id), createdAt: row.createdAt.toISOString() }
}

@Injectable()
export class LogsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(viewer: Viewer, query: LogQuery): Promise<OutputOf<typeof contract.listLogs>> {
    const rows = await this.db
      .select(itemColumns)
      .from(operationLogs)
      .where(
        and(
          moduleFilter(viewer, query.module),
          ...dateFilter(query.from, query.to),
          beforeCursor(operationLogs.createdAt, operationLogs.id, query.cursor),
        ),
      )
      .orderBy(desc(operationLogs.createdAt), desc(operationLogs.id))
      .limit(query.limit + 1)
    const page = pageOf(rows, query.limit, (row) => [row.createdAt.toISOString(), row.id])
    return { items: page.items.map(toItem), nextCursor: page.nextCursor, actions: [] }
  }

  // 看不到的日志（含员工读公共日志）当成找不到
  async get(viewer: Viewer, id: number): Promise<LogDetail> {
    const [row] = await this.db
      .select({
        ...itemColumns,
        reason: operationLogs.reason,
        before: operationLogs.before,
        after: operationLogs.after,
      })
      .from(operationLogs)
      .where(and(eq(operationLogs.id, id), visibleTo(viewer)))
    if (!row) throw appError.notFound()
    // before、after 由各写操作按「字段中文名 → 显示值」写入（05 章第 3 节）
    return {
      ...toItem(row),
      reason: row.reason,
      before: row.before as LogView,
      after: row.after as LogView,
    }
  }
}
