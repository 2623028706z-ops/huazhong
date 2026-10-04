// 实时推送的内部消息：写事务里 pg_notify，事务提交后 PostgreSQL 才投递（05 章第 12.4 节）
import { topicSchema } from '@huazhong/shared'
import * as z from 'zod'

export const CHANGES_CHANNEL = 'hz_changes'
// PostgreSQL NOTIFY payload 上限 8000 字节
export const CHANGES_PAYLOAD_MAX_BYTES = 7999

const idList = z.array(z.string())

export const changesPayloadSchema = z.object({
  changes: z.array(z.object({ topic: topicSchema, version: z.number().int().nullable() })),
  scope: z.object({ storeIds: idList, supplierIds: idList }),
})
export type ChangesPayload = z.infer<typeof changesPayloadSchema>
export type ChangeScope = ChangesPayload['scope']

export function encodeChanges(payload: ChangesPayload): string[] {
  const text = JSON.stringify(payload)
  if (Buffer.byteLength(text) <= CHANGES_PAYLOAD_MAX_BYTES) return [text]
  const { changes, scope } = payload
  if (Buffer.byteLength(JSON.stringify(scope)) > CHANGES_PAYLOAD_MAX_BYTES / 2) {
    const key = scope.storeIds.length >= scope.supplierIds.length ? 'storeIds' : 'supplierIds'
    const ids = scope[key]
    if (ids.length > 1) {
      const middle = Math.ceil(ids.length / 2)
      return [ids.slice(0, middle), ids.slice(middle)].flatMap((part) =>
        encodeChanges({ changes, scope: { ...scope, [key]: part } }),
      )
    }
  }
  if (changes.length > 1) {
    const middle = Math.ceil(changes.length / 2)
    return [changes.slice(0, middle), changes.slice(middle)].flatMap((part) =>
      encodeChanges({ changes: part, scope }),
    )
  }
  throw new Error('single change payload too large')
}
