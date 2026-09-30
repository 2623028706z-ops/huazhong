// 结构化日志：一行一条 JSON，写到标准输出，由云托管收集（01 章第 5 节）
import type { LoggerService } from '@nestjs/common'
import { requestContext } from './request-context.ts'

type Level = 'info' | 'warn' | 'error'

function write(level: Level, event: string, fields: Record<string, unknown>): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    requestId: requestContext.get()?.requestId ?? null,
    ...fields,
  })
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (event: string, fields: Record<string, unknown> = {}) => {
    write('info', event, fields)
  },
  warn: (event: string, fields: Record<string, unknown> = {}) => {
    write('warn', event, fields)
  },
  error: (event: string, fields: Record<string, unknown> = {}) => {
    write('error', event, fields)
  },
}

// Nest 自己的启动日志也走同一个格式
export const nestLogger: LoggerService = {
  log: (message: unknown) => {
    write('info', 'nest', { message })
  },
  warn: (message: unknown) => {
    write('warn', 'nest', { message })
  },
  error: (message: unknown, stack?: unknown) => {
    write('error', 'nest', { message, stack })
  },
}
