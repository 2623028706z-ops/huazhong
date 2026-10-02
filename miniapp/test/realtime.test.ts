import { RECONNECT_DELAYS_SECONDS, WS_CLOSE, WS_PING_INTERVAL_SECONDS } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { Realtime, type AuthFailure } from '../miniprogram/core/realtime'
import { installFakeWx, type FakeSocket } from './fake-wx'

vi.mock('../miniprogram/core/config', () => ({
  cloudTarget: () => ({ env: 'test-env', service: 'test-service' }),
}))

const ABNORMAL = 1006
let sockets: FakeSocket[]
let onResync: Mock<() => void>
let onAuthFailure: Mock<(code: AuthFailure) => void>
let realtime: Realtime

function latest(): FakeSocket {
  const socket = sockets[sockets.length - 1]
  if (!socket) throw new Error('no socket')
  return socket
}

beforeEach(() => {
  vi.useFakeTimers()
  ;({ sockets } = installFakeWx())
  onResync = vi.fn<() => void>()
  onAuthFailure = vi.fn<(code: AuthFailure) => void>()
  realtime = new Realtime({ onResync, onAuthFailure })
  realtime.start()
  latest().emitOpen()
})

afterEach(() => {
  realtime.stop()
  vi.useRealTimers()
})

describe('订阅', () => {
  it('同一主题两个页面订阅只发一次 subscribe，最后一个退订才发 unsubscribe', () => {
    const offA = realtime.subscribe('order:1', vi.fn())
    const offB = realtime.subscribe('order:1', vi.fn())
    offA()
    expect(latest().sent).toEqual([{ op: 'subscribe', topics: ['order:1'] }])
    offB()
    expect(latest().sent).toEqual([
      { op: 'subscribe', topics: ['order:1'] },
      { op: 'unsubscribe', topics: ['order:1'] },
    ])
  })

  it('收到变更推给这个主题的监听者，带版本号', () => {
    const listener = vi.fn()
    realtime.subscribe('order:1', listener)
    latest().emitMessage({ op: 'changed', topic: 'order:1', version: 5 })
    latest().emitMessage({ op: 'changed', topic: 'order:2', version: 3 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(5)
  })

  it('通配订阅 todo:* 收到具体的 todo:sales', () => {
    const listener = vi.fn()
    realtime.subscribe('todo:*', listener)
    latest().emitMessage({ op: 'changed', topic: 'todo:sales', version: null })
    expect(listener).toHaveBeenCalledWith(null)
  })
})

describe('心跳', () => {
  it(`每 ${String(WS_PING_INTERVAL_SECONDS)} 秒发一次 ping`, () => {
    vi.advanceTimersByTime(WS_PING_INTERVAL_SECONDS * 1000)
    vi.advanceTimersByTime(WS_PING_INTERVAL_SECONDS * 1000)
    expect(latest().sent).toEqual([{ op: 'ping' }, { op: 'ping' }])
  })
})

describe('断线重连', () => {
  it('按重连间隔依次等待，之后一直按最后一个', () => {
    const expected: number[] = [...RECONNECT_DELAYS_SECONDS, RECONNECT_DELAYS_SECONDS.at(-1) ?? 0]
    for (const seconds of expected) {
      const before = sockets.length
      latest().emitClose(ABNORMAL)
      vi.advanceTimersByTime(seconds * 1000 - 1)
      expect(sockets).toHaveLength(before)
      vi.advanceTimersByTime(1)
      expect(sockets).toHaveLength(before + 1)
    }
  })

  it('连上以后重置间隔', () => {
    latest().emitClose(ABNORMAL)
    vi.advanceTimersByTime(RECONNECT_DELAYS_SECONDS[0] * 1000)
    latest().emitOpen()
    const before = sockets.length
    latest().emitClose(ABNORMAL)
    vi.advanceTimersByTime(RECONNECT_DELAYS_SECONDS[0] * 1000)
    expect(sockets).toHaveLength(before + 1)
  })

  it('重连后重新订阅全部主题，并通知整页刷新一次；第一次连上不通知', () => {
    realtime.subscribe('order:1', vi.fn())
    realtime.subscribe('orders', vi.fn())
    expect(onResync).not.toHaveBeenCalled()
    latest().emitClose(ABNORMAL)
    vi.advanceTimersByTime(RECONNECT_DELAYS_SECONDS[0] * 1000)
    latest().emitOpen()
    expect(latest().sent).toEqual([{ op: 'subscribe', topics: ['order:1', 'orders'] }])
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('服务端要求 resync 时通知整页刷新', () => {
    latest().emitMessage({ op: 'resync' })
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('没绑定（4401）不再重连，交给调用方', () => {
    const before = sockets.length
    latest().emitClose(WS_CLOSE.unauthenticated)
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(before)
    expect(onAuthFailure).toHaveBeenCalledWith(WS_CLOSE.unauthenticated)
  })

  it('切到后台主动断开，不重连', () => {
    const before = sockets.length
    realtime.stop()
    expect(latest().closed).toBe(true)
    vi.advanceTimersByTime(60_000)
    expect(sockets).toHaveLength(before)
  })

  it('回到前台重新连接', () => {
    realtime.stop()
    realtime.start()
    latest().emitOpen()
    expect(onResync).toHaveBeenCalledTimes(1)
  })

  it('旧连接迟到的消息、关闭和打开不影响前台的新连接', () => {
    const old = latest(),
      listener = vi.fn()
    realtime.subscribe('po:1', listener)
    realtime.stop()
    realtime.start()
    const current = latest()
    current.emitOpen()
    old.emitClose(WS_CLOSE.unauthenticated)
    old.emitOpen()
    old.emitMessage({ op: 'changed', topic: 'po:1', version: 2 })
    expect(onAuthFailure).not.toHaveBeenCalled()
    expect(onResync).toHaveBeenCalledTimes(1)
    expect(listener).not.toHaveBeenCalled()
    current.emitMessage({ op: 'changed', topic: 'po:1', version: 3 })
    expect(listener).toHaveBeenCalledWith(3)
    vi.advanceTimersByTime(WS_PING_INTERVAL_SECONDS * 1000)
    expect(current.sent.at(-1)).toEqual({ op: 'ping' })
  })
})
