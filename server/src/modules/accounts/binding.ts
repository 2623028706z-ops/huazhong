// 账号类写操作的公共部分：清空微信绑定、公共日志的格式（05 章第 2、3 节）
import { copy } from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import type { Tx } from '../../../db/client.ts'
import { accounts } from '../../../db/schema/index.ts'

export const versionPlusOne = sql`${accounts.version} + 1`

// 退出登录、管理员解绑、改手机号或停用员工时清空；下次打开要重新手机号验证
export async function clearBinding(tx: Tx, accountId: number): Promise<void> {
  await tx
    .update(accounts)
    .set({ openid: null, boundAt: null, version: versionPlusOne })
    .where(eq(accounts.id, accountId))
}

// 账号类操作不属于任何模块：module 为 null（公共），只有管理员能看
export function accountLog(target: { accountId: number; name: string }, action: string) {
  return {
    module: null,
    kind: copy.log.kindAccount,
    action,
    targetType: 'accounts',
    targetId: target.accountId,
    targetLabel: target.name,
  }
}
