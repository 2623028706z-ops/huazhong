import { afterEach, expect, it, vi } from 'vitest'
import { realtime, unwatch, watchNewer } from '../miniprogram/core/live'
import { installFakeWx } from './fake-wx'

vi.mock('../miniprogram/core/config', () => ({
  cloudTarget: () => ({ env: 'local-test', service: 'local-test' }),
}))
afterEach(() => {
  realtime.stop()
  vi.unstubAllGlobals()
})

it('H12-F null派生版本强制通知；相同数字版本可以忽略', () => {
  const { sockets } = installFakeWx()
  realtime.start()
  const socket = sockets[0]
  socket?.emitOpen()
  const page = {},
    changed = vi.fn()
  watchNewer(page, 'order:1', () => 7, changed)
  socket?.emitMessage({ op: 'changed', topic: 'order:1', version: 7 })
  expect(changed).not.toHaveBeenCalled()
  socket?.emitMessage({ op: 'changed', topic: 'order:1', version: null })
  expect(changed).toHaveBeenCalledTimes(1)
  socket?.emitMessage({ op: 'changed', topic: 'order:1', version: 8 })
  expect(changed).toHaveBeenCalledTimes(2)
  unwatch(page)
  socket?.emitMessage({ op: 'changed', topic: 'order:1', version: null })
  expect(changed).toHaveBeenCalledTimes(2)
})
