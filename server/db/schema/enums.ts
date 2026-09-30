// 数据库原生 enum：值直接取 shared 的枚举（04 章第 1 节）
import { accountTypes, moduleKeys } from '@huazhong/shared'
import { pgEnum } from 'drizzle-orm/pg-core'

export const accountType = pgEnum('account_type', accountTypes)
export const moduleKey = pgEnum('module_key', moduleKeys)
