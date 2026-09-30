// 接口测试的 WebSocket 客户端：带云托管会注入的 X-WX-OPENID
import { WS_PATH, type ClientMessage, type ServerMessage } from '@huazhong/shared'
import WebSocket from 'ws'
import type { TestApp } from './app.ts'

const WAIT_MS = 5000

export interface WsClient {
  send(message: ClientMessage): void
  // 等下一条满足条件的消息（之前收到但没被取走的也算）
  next(match: (message: ServerMessage) => boolean): Promise<ServerMessage>
  // 发 ping 等 pong：服务端按顺序处理消息，pong 回来说明之前的订阅已经生效
  sync(): Promise<void>
  readonly closed: Promise<number>
  close(): void
}

export async function connect(t: TestApp, openid?: string): Promise<WsClient> {
  const socket = new WebSocket(t.baseUrl.replace('http', 'ws') + WS_PATH, {
    headers: openid ? { 'x-wx-openid': openid } : {},
  })
  const inbox: ServerMessage[] = []
  const waiters: (() => void)[] = []
  socket.on('message', (data) => {
    // 服务端只发文本帧，ws 默认交给我们 Buffer
    inbox.push(JSON.parse((data as Buffer).toString('utf8')) as ServerMessage)
    for (const wake of waiters.splice(0)) wake()
  })
  const closed = new Promise<number>((resolve) => socket.on('close', resolve))
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => {
      resolve()
    })
    socket.once('error', reject)
  })
  const next = async (match: (message: ServerMessage) => boolean): Promise<ServerMessage> => {
    const deadline = Date.now() + WAIT_MS
    for (;;) {
      const index = inbox.findIndex(match)
      if (index >= 0) return inbox.splice(index, 1)[0] as ServerMessage
      if (Date.now() > deadline)
        throw new Error(`no matching message; inbox ${JSON.stringify(inbox)}`)
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, WAIT_MS)
      })
    }
  }
  return {
    send: (message) => {
      socket.send(JSON.stringify(message))
    },
    next,
    async sync() {
      socket.send(JSON.stringify({ op: 'ping' }))
      await next((m) => m.op === 'pong')
    },
    closed,
    close: () => {
      socket.close()
    },
  }
}
