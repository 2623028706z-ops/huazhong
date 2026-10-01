// 账号类写操作的公共日志格式（05 章第 2、3 节）；清空绑定在 common/account-writes.ts
import { copy } from '@huazhong/shared'

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
