// 实时推送的协议（05 章第 12 节）：主题的写法、客户端消息、服务端消息
import * as z from 'zod'
import { RECONNECT_DELAYS_SECONDS } from './config.ts'
import { moduleKeys } from './enums.ts'

export const WS_PATH = '/ws'
export const WS_CLOSE = { unauthenticated: 4401, accountDisabled: 4403 } as const

const MS_PER_SECOND = 1000

// 第 attempt 次（从 0 起）断线重连前等多久：按 RECONNECT_DELAYS_SECONDS 依次取，之后一直按最后一个。
// 小程序 WebSocket 和服务端 LISTEN 共用
export function reconnectDelayMs(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), RECONNECT_DELAYS_SECONDS.length - 1)
  return (RECONNECT_DELAYS_SECONDS[index] ?? 0) * MS_PER_SECOND
}

type Id = string
// 主题。ID 都是字符串（00 章第 3 节）；通配订阅只有待办、应收、应付三类（主题以 :* 结尾）
export type Topic =
  | `order:${Id}`
  | 'orders'
  | `after:${Id}`
  | 'afters'
  | `po:${Id}`
  | 'pos'
  | `invite:${Id}`
  | 'invites'
  | `wh_doc:${Id}`
  | 'wh_docs'
  | `receipt:${Id}`
  | `payable:po:${Id}`
  | `payable:wh:${Id}`
  | `ar:${Id}`
  | 'ar:*'
  | `ap:${Id}`
  | 'ap:*'
  | `supplier:${Id}`
  | `catalog:${Id}`
  | 'stock'
  | 'demand'
  | `todo:${(typeof moduleKeys)[number]}`
  | 'todo:*'
  | `account:${Id}`
  | `store_invites:${Id}`
  | 'brand'

const topicPattern = new RegExp(
  '^(?:' +
    [
      '(?:order|after|po|invite|wh_doc|receipt|supplier|catalog|account|store_invites):[1-9][0-9]*',
      'payable:(?:po|wh):[1-9][0-9]*',
      '(?:ar|ap):(?:[1-9][0-9]*|\\*)',
      `todo:(?:${moduleKeys.join('|')}|\\*)`,
      'orders|afters|pos|invites|wh_docs|stock|demand|brand',
    ].join('|') +
    ')$',
)

export const topicSchema = z.custom<Topic>(
  (value) => typeof value === 'string' && topicPattern.test(value),
)

export const clientMessageSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('ping') }),
  z.object({ op: z.literal('subscribe'), topics: z.array(topicSchema) }),
  z.object({ op: z.literal('unsubscribe'), topics: z.array(topicSchema) }),
])
export type ClientMessage = z.infer<typeof clientMessageSchema>

export type ServerMessage =
  { op: 'pong' } | { op: 'resync' } | { op: 'changed'; topic: Topic; version: number | null }
