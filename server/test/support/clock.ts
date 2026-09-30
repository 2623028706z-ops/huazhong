// 可以拨动的时钟：测跨日发号
import { Clock } from '../../src/common/clock.ts'

export class TestClock extends Clock {
  constructor(private nowMs: number) {
    super()
  }

  set(iso: string): void {
    this.nowMs = Date.parse(iso)
  }

  override now(): Date {
    return new Date(this.nowMs)
  }
}
