// 超过 WS_IDLE_TIMEOUT_SECONDS 没收到任何消息（心跳也算）就断开（05 章第 12.1 节）
import { WS_IDLE_TIMEOUT_SECONDS } from '@huazhong/shared'

const MS_PER_SECOND = 1000

export function isIdle(lastSeenMs: number, nowMs: number): boolean {
  return nowMs - lastSeenMs > WS_IDLE_TIMEOUT_SECONDS * MS_PER_SECOND
}
