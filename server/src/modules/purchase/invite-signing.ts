import { createHmac, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { ENV, type Env } from '../../env.ts'

@Injectable()
export class InviteSigning {
  private readonly key: string
  constructor(@Inject(ENV) env: Env) {
    const key =
      env.INVITE_SIGNING_KEY ??
      (env.NODE_ENV === 'test' ? 'huazhong-test-invite-signing' : undefined)
    if (key === undefined) throw new Error('INVITE_SIGNING_KEY is required')
    this.key = key
  }
  sign(id: string): string {
    return createHmac('sha256', this.key).update(id).digest('hex')
  }
  verify(id: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(id))
    const actual = Buffer.from(signature)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
