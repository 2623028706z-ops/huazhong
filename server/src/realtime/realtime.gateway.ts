// WebSocket：握手时按 X-WX-OPENID 认身份，订阅按权限检查，收到变更按 scope 过滤后推送（05 章第 12 节）
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  AppError,
  clientMessageSchema,
  WS_CLOSE,
  WS_PATH,
  WS_PING_INTERVAL_SECONDS,
  type ServerMessage,
  type Topic,
} from '@huazhong/shared'
import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import type { ChangesPayload } from '../common/changes.ts'
import type { Viewer } from '../common/domain/viewer.ts'
import { OPENID_HEADER } from '../common/access.guard.ts'
import { IdentityService } from '../common/identity.ts'
import { logger } from '../common/logger.ts'
import { canDeliver, canSubscribe, covers } from './domain/access.ts'
import { isIdle } from './domain/idle.ts'

const MS_PER_SECOND = 1000
const CLOSE_INTERNAL = 1011

interface Connection {
  readonly socket: WebSocket
  readonly openid: string
  viewer: Viewer
  readonly topics: Set<Topic>
  lastSeenMs: number
}

function closeCodeOf(error: unknown): number {
  if (error instanceof AppError && error.code === 'UNAUTHENTICATED') return WS_CLOSE.unauthenticated
  if (error instanceof AppError && error.code === 'ACCOUNT_DISABLED')
    return WS_CLOSE.accountDisabled
  logger.error('ws identity failed', {
    error: error instanceof Error ? error.stack : String(error),
  })
  return CLOSE_INTERNAL
}

function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8')
}

function send(conn: Connection, message: ServerMessage): void {
  if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(JSON.stringify(message))
}

@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly server = new WebSocketServer({ noServer: true })
  private readonly connections = new Set<Connection>()
  private idleTimer: NodeJS.Timeout | undefined

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly identity: IdentityService,
  ) {}

  onApplicationBootstrap(): void {
    const http = this.adapterHost.httpAdapter.getHttpServer() as Server
    http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      void this.handleUpgrade(req, socket, head)
    })
    this.idleTimer = setInterval(() => {
      this.closeIdle()
    }, WS_PING_INTERVAL_SECONDS * MS_PER_SECOND)
  }

  beforeApplicationShutdown(): void {
    clearInterval(this.idleTimer)
    for (const conn of this.connections) conn.socket.terminate()
    this.server.close()
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (new URL(req.url ?? '', 'http://localhost').pathname !== WS_PATH) {
      socket.destroy()
      return
    }
    const header = req.headers[OPENID_HEADER]
    const openid = typeof header === 'string' ? header : undefined
    let viewer: Viewer | null = null
    let closeCode = 0
    try {
      viewer = await this.identity.resolve(openid)
    } catch (error) {
      closeCode = closeCodeOf(error)
    }
    this.server.handleUpgrade(req, socket, head, (ws) => {
      if (!viewer || !openid) ws.close(closeCode)
      else this.accept(ws, openid, viewer)
    })
  }

  private accept(socket: WebSocket, openid: string, viewer: Viewer): void {
    const conn: Connection = { socket, openid, viewer, topics: new Set(), lastSeenMs: Date.now() }
    this.connections.add(conn)
    socket.on('message', (data) => {
      this.onMessage(conn, data)
    })
    socket.on('close', () => this.connections.delete(conn))
  }

  // 格式不对、没权限的主题直接忽略（05 章第 12.1 节）
  private onMessage(conn: Connection, data: RawData): void {
    conn.lastSeenMs = Date.now()
    let raw: unknown
    try {
      raw = JSON.parse(textOf(data))
    } catch {
      return
    }
    const parsed = clientMessageSchema.safeParse(raw)
    if (!parsed.success) return
    const message = parsed.data
    if (message.op === 'ping') send(conn, { op: 'pong' })
    else if (message.op === 'subscribe') {
      for (const topic of message.topics)
        if (canSubscribe(conn.viewer, topic)) conn.topics.add(topic)
    } else for (const topic of message.topics) conn.topics.delete(topic)
  }

  async dispatch(payload: ChangesPayload): Promise<void> {
    for (const change of payload.changes) {
      if (change.topic.startsWith('account:'))
        await this.refreshAccount(change.topic.slice('account:'.length))
    }
    for (const conn of this.connections) {
      for (const change of payload.changes) {
        const subscribed = [...conn.topics].some((topic) => covers(topic, change.topic))
        if (subscribed && canDeliver(conn.viewer, change.topic, payload.scope)) {
          send(conn, { op: 'changed', topic: change.topic, version: change.version })
        }
      }
    }
  }

  // 账号解绑、停用、改了模块：重新认身份，去掉没权限的订阅（05 章第 12.4 节）
  private async refreshAccount(accountId: string): Promise<void> {
    for (const conn of this.connections) {
      if (String(conn.viewer.accountId) !== accountId) continue
      try {
        conn.viewer = await this.identity.resolve(conn.openid)
      } catch (error) {
        conn.socket.close(closeCodeOf(error))
        continue
      }
      for (const topic of conn.topics)
        if (!canSubscribe(conn.viewer, topic)) conn.topics.delete(topic)
    }
  }

  // LISTEN 断线重连后，期间的变更可能丢了：让所有页面整页刷新一次
  resyncAll(): void {
    for (const conn of this.connections) send(conn, { op: 'resync' })
  }

  private closeIdle(): void {
    const now = Date.now()
    for (const conn of this.connections) if (isIdle(conn.lastSeenMs, now)) conn.socket.terminate()
  }
}
