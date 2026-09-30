// 每个实例一条专用连接 LISTEN hz_changes（不走连接池），断线按 RECONNECT_DELAYS_SECONDS 重连，
// 重连后给本实例所有 WebSocket 发 resync（05 章第 12.4 节）
import { reconnectDelayMs } from '@huazhong/shared'
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import pg from 'pg'
import { ENV, type Env } from '../env.ts'
import { CHANGES_CHANNEL, changesPayloadSchema } from '../common/changes.ts'
import { logger } from '../common/logger.ts'
import { RealtimeGateway } from './realtime.gateway.ts'

@Injectable()
export class ChangeListener implements OnApplicationBootstrap, OnApplicationShutdown {
  private client: pg.Client | null = null
  private stopped = false
  private attempt = 0
  private retryTimer: NodeJS.Timeout | undefined

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly gateway: RealtimeGateway,
  ) {}

  // 启动时连不上直接失败，让云托管重启实例
  async onApplicationBootstrap(): Promise<void> {
    await this.connect()
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true
    clearTimeout(this.retryTimer)
    await this.client?.end()
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.env.DATABASE_URL })
    client.on('notification', (message) => {
      this.onNotification(message.payload)
    })
    client.on('error', (error) => {
      logger.warn('listen connection error', { error: error.message })
    })
    client.on('end', () => {
      this.scheduleReconnect()
    })
    await client.connect()
    await client.query(`LISTEN ${CHANGES_CHANNEL}`)
    this.client = client
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    this.client = null
    const delay = reconnectDelayMs(this.attempt)
    this.attempt += 1
    this.retryTimer = setTimeout(() => {
      void this.reconnect()
    }, delay)
  }

  private async reconnect(): Promise<void> {
    try {
      await this.connect()
      this.attempt = 0
      this.gateway.resyncAll()
    } catch (error) {
      logger.warn('listen reconnect failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      this.scheduleReconnect()
    }
  }

  private onNotification(payload: string | undefined): void {
    let raw: unknown
    try {
      raw = JSON.parse(payload ?? '')
    } catch {
      logger.error('bad change payload', { payload })
      return
    }
    const parsed = changesPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      logger.error('bad change payload', { payload })
      return
    }
    this.gateway.dispatch(parsed.data).catch((error: unknown) => {
      logger.error('dispatch failed', {
        error: error instanceof Error ? error.stack : String(error),
      })
    })
  }
}
