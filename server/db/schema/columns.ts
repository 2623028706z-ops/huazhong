// 公共列（04 章第 1 节）：id、created_at、updated_at、created_by；会被修改的单据另有 version。
// created_by 引用 accounts，accounts 又用这些公共列，两个文件互相 import：
// 这里只用函数声明（会提升），accounts.id 只在外键回调里取，所以加载顺序不影响。
import { bigint, integer, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { accounts } from './accounts.ts'

export function timestamptz() {
  return timestamp({ withTimezone: true, precision: 3 })
}

export function idColumn() {
  return bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity()
}

export function accountRef() {
  // 显式写 AnyPgColumn：accounts 自己也用公共列，不写的话 TypeScript 推断会绕成一个圈
  return bigint({ mode: 'number' }).references((): AnyPgColumn => accounts.id, {
    onDelete: 'restrict',
  })
}

export function commonColumns() {
  return {
    id: idColumn(),
    createdAt: timestamptz().notNull().defaultNow(),
    updatedAt: timestamptz()
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    createdBy: accountRef().notNull(),
  }
}

export function versionColumn() {
  return integer().notNull().default(1)
}
