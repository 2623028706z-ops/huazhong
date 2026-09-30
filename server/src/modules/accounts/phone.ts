// 手机号快速验证：getPhoneNumber 的动态令牌换手机号（01 章第 4 节、05 章第 2 节）。
// 走云托管开放接口服务（控制台要开通 getuserphonenumber 的调用权限），请求不用 access_token。
// 接口测试换成假的实现（test/support/phone.ts）
import { appError, copy } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'
import * as z from 'zod'
import { logger } from '../../common/logger.ts'

export abstract class PhoneExchange {
  // 令牌无效或过期 → BUSINESS_RULE；返回不带区号的 11 位手机号
  abstract exchange(code: string): Promise<string>
}

const OPEN_API_URL = 'http://api.weixin.qq.com/wxa/business/getuserphonenumber'
const MAINLAND_COUNTRY_CODE = '86'

const responseSchema = z.object({
  errcode: z.number(),
  phone_info: z.object({ purePhoneNumber: z.string(), countryCode: z.string() }).optional(),
})

@Injectable()
export class WechatPhoneExchange extends PhoneExchange {
  async exchange(code: string): Promise<string> {
    let raw: unknown
    try {
      const res = await fetch(OPEN_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      raw = await res.json()
    } catch (error) {
      logger.error('phone exchange failed', { error: String(error) })
      throw appError.internal()
    }
    // 外部服务的返回在边界校验一次（00 章第 11.4 节）
    const parsed = responseSchema.safeParse(raw)
    if (!parsed.success) throw appError.internal()
    const info = parsed.data.phone_info
    if (parsed.data.errcode !== 0 || !info || info.countryCode !== MAINLAND_COUNTRY_CODE) {
      throw appError.businessRule(copy.auth.phoneCodeInvalid)
    }
    return info.purePhoneNumber
  }
}
