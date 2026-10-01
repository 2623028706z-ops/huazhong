// 账号行的公共写法：员工（accounts 模块）和门店账号（sales 模块）共用（04 章第 3.1 节）
import { appError, copy } from '@huazhong/shared'
import { and, eq, ne, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client.ts'
import { accounts } from '../../db/schema/index.ts'

export const versionPlusOne = sql`${accounts.version} + 1`

// 退出登录、管理员解绑、改手机号或停用时清空；下次打开要重新手机号验证
export async function clearBinding(tx: Tx, accountId: number): Promise<void> {
  await tx
    .update(accounts)
    .set({ openid: null, boundAt: null, version: versionPlusOne })
    .where(eq(accounts.id, accountId))
}

// 启用的账号里登录手机号不能重复（员工、门店、供应商一起算）
export async function assertPhoneFree(
  tx: Tx,
  phone: string,
  exceptId: number | null,
  field: string,
): Promise<void> {
  const [taken] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.phone, phone),
        eq(accounts.enabled, true),
        exceptId === null ? undefined : ne(accounts.id, exceptId),
      ),
    )
    .limit(1)
  if (taken) throw appError.validation({ [field]: copy.staff.phoneTaken })
}

// 并发写同一个手机号时，部分唯一索引兜底（guardUnique 的约束名）
export const ENABLED_PHONE_INDEX = 'accounts_enabled_phone'
