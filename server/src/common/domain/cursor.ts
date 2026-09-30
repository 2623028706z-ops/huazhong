// 游标：最后一条的排序键 + id，编码后下发；前端原样带回（05 章第 1.3 节）
import { appError, copy } from '@huazhong/shared'
import * as z from 'zod'

const cursorSchema = z.tuple([z.union([z.string(), z.number()]), z.number().int().positive()])
export type Cursor = z.infer<typeof cursorSchema>

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')))
  } catch {
    throw appError.validation({ cursor: copy.error.validationFallback })
  }
}

// 多取一条判断有没有下一页
export function pageOf<T>(rows: T[], limit: number, cursorOf: (row: T) => Cursor) {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  const nextCursor = rows.length > limit && last !== undefined ? encodeCursor(cursorOf(last)) : null
  return { items, nextCursor }
}
