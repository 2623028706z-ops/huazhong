// 实时同步：只走这里（00 章第 6 节）。一个小程序只保持一条 WebSocket（05 章第 12 节）
import {
  WS_CLOSE,
  WS_PATH,
  WS_PING_INTERVAL_SECONDS,
  reconnectDelayMs,
  type ClientMessage,
  type ServerMessage,
  type Topic,
} from '@huazhong/shared'
import { cloudTarget } from './config'

type ChangeListener = (version: number | null) => void
export type AuthFailure = (typeof WS_CLOSE)[keyof typeof WS_CLOSE]

interface Events {
  // 重连成功、服务端要求重新同步：当前页整页刷新一次
  onResync: () => void
  // 没绑定或停用：不再重连，交给调用方进登录页或停用页
  onAuthFailure: (code: AuthFailure) => void
}

const MS_PER_SECOND = 1000
const authCodes: readonly number[] = Object.values(WS_CLOSE)

function wildcardOf(topic: string): string {
  return `${topic.slice(0, topic.indexOf(':'))}:*`
}

export class Realtime {
  private readonly listeners = new Map<Topic, Set<ChangeListener>>()
  private socket: WechatMiniprogram.SocketTask | null = null
  private isOpen = false
  private isRunning = false
  private hasConnected = false
  private attempt = 0
  private connectionVersion = 0
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly events: Events) {}

  // 回到前台
  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.connect()
  }

  // 切到后台：断开，不重连
  stop(): void {
    this.isRunning = false
    this.connectionVersion += 1
    this.isOpen = false
    clearTimeout(this.reconnectTimer)
    clearInterval(this.pingTimer)
    this.socket?.close({})
    this.socket = null
  }

  // 同一主题多个页面订阅时只发一次 subscribe，最后一个退订时才发 unsubscribe
  subscribe(topic: Topic, listener: ChangeListener): () => void {
    let set = this.listeners.get(topic)
    if (!set) {
      set = new Set()
      this.listeners.set(topic, set)
      this.send({ op: 'subscribe', topics: [topic] })
    }
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size > 0) return
      this.listeners.delete(topic)
      this.send({ op: 'unsubscribe', topics: [topic] })
    }
  }

  private connect(): void {
    const version = ++this.connectionVersion
    const target = cloudTarget()
    wx.cloud.connectContainer({
      config: { env: target.env },
      service: target.service,
      path: WS_PATH,
      success: ({ socketTask }) => {
        if (version !== this.connectionVersion) {
          socketTask.close({})
          return
        }
        this.socket = socketTask
        socketTask.onOpen(() => {
          if (version === this.connectionVersion) this.handleOpen()
        })
        socketTask.onClose(({ code }) => {
          if (version === this.connectionVersion) this.handleClose(code)
        })
        socketTask.onMessage(({ data }) => {
          if (version === this.connectionVersion && typeof data === 'string')
            this.dispatch(JSON.parse(data) as ServerMessage)
        })
      },
      // 连不上（断网等）：和断开一样按重连间隔再试
      fail: () => {
        if (version === this.connectionVersion) this.handleClose(0)
      },
    })
  }

  private handleOpen(): void {
    this.isOpen = true
    this.attempt = 0
    if (this.listeners.size > 0) this.send({ op: 'subscribe', topics: [...this.listeners.keys()] })
    this.pingTimer = setInterval(() => {
      this.send({ op: 'ping' })
    }, WS_PING_INTERVAL_SECONDS * MS_PER_SECOND)
    if (this.hasConnected) this.events.onResync()
    this.hasConnected = true
  }

  private handleClose(code: number): void {
    this.isOpen = false
    this.socket = null
    clearInterval(this.pingTimer)
    if (!this.isRunning) return
    if (authCodes.includes(code)) {
      this.isRunning = false
      this.events.onAuthFailure(code as AuthFailure)
      return
    }
    // 等待时间和服务端 LISTEN 重连共用 shared 的 reconnectDelayMs
    const delay = reconnectDelayMs(this.attempt)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private dispatch(message: ServerMessage): void {
    if (message.op === 'resync') this.events.onResync()
    if (message.op !== 'changed') return
    const exact = this.listeners.get(message.topic)
    // 通配订阅（主题以 :* 结尾）收到的是具体主题
    const wildcard = this.listeners.get(wildcardOf(message.topic) as Topic)
    for (const set of [exact, wildcard]) {
      set?.forEach((listener) => {
        listener(message.version)
      })
    }
  }

  private send(message: ClientMessage): void {
    if (this.isOpen) this.socket?.send({ data: JSON.stringify(message) })
  }
}
