// 接口测试里的手机号快速验证：令牌写成「phone:手机号」就换出这个手机号，其余当成无效令牌
import { appError, copy } from '@huazhong/shared'
import { PhoneExchange } from '../../src/modules/accounts/phone.ts'

const PREFIX = 'phone:'

export const phoneCode = (phone: string) => `${PREFIX}${phone}`

export class FakePhoneExchange extends PhoneExchange {
  exchange(code: string): Promise<string> {
    if (!code.startsWith(PREFIX))
      return Promise.reject(appError.businessRule(copy.auth.phoneCodeInvalid))
    return Promise.resolve(code.slice(PREFIX.length))
  }
}
