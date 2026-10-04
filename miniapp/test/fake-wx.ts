// 测试用的假 wx：记录 callContainer、connectContainer 的调用，由测试决定返回什么
import { vi } from 'vitest'

export interface ContainerCall {
  path: string
  method: string
  header: Record<string, string>
  data: unknown
}

export type ContainerReply =
  { statusCode: number; data: unknown; header?: Record<string, string> } | 'network-error'

type CloseResult = { code: number; reason: string }

export class FakeSocket {
  sent: unknown[] = []
  closed = false
  private openListener?: () => void
  private closeListener?: (result: CloseResult) => void
  private messageListener?: (result: { data: string }) => void

  onOpen(listener: () => void) {
    this.openListener = listener
  }
  onClose(listener: (result: CloseResult) => void) {
    this.closeListener = listener
  }
  onMessage(listener: (result: { data: string }) => void) {
    this.messageListener = listener
  }
  send({ data }: { data: string }) {
    this.sent.push(JSON.parse(data))
  }
  // 客户端主动关（切到后台）：和微信一样随后触发 onClose
  close() {
    this.closed = true
    this.closeListener?.({ code: 1000, reason: '' })
  }
  emitOpen() {
    this.openListener?.()
  }
  emitClose(code: number) {
    this.closeListener?.({ code, reason: '' })
  }
  emitMessage(message: unknown) {
    this.messageListener?.({ data: JSON.stringify(message) })
  }
}

type CallParam = ContainerCall & { success: (r: unknown) => void; fail: (e: unknown) => void }

export function installFakeWx() {
  const calls: ContainerCall[] = []
  const replies: ContainerReply[] = []
  const sockets: FakeSocket[] = []
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    getRealtimeLogManager: () => ({ warn: () => undefined, error: () => undefined }),
    cloud: {
      callContainer(param: CallParam) {
        calls.push({
          path: param.path,
          method: param.method,
          header: param.header,
          data: param.data,
        })
        const reply = replies.shift() ?? 'network-error'
        if (reply === 'network-error') param.fail({ errMsg: 'callContainer:fail timeout' })
        else param.success({ header: {}, ...reply })
      },
      connectContainer(param: { success: (r: { socketTask: FakeSocket }) => void }) {
        const socket = new FakeSocket()
        sockets.push(socket)
        param.success({ socketTask: socket })
      },
    },
  }
  vi.stubGlobal('wx', wx)
  return { calls, replies, sockets }
}
