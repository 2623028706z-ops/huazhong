// 当前时间：业务代码只从这里取，接口测试可以换成固定时间（跨日、发号）
import { shanghaiDateOf } from '@huazhong/shared'
import { Injectable } from '@nestjs/common'

@Injectable()
export class Clock {
  now(): Date {
    return new Date()
  }

  // 业务日期「今天」，按 Asia/Shanghai（00 章第 3 节）
  today(): string {
    return shanghaiDateOf(this.now().getTime())
  }
}
