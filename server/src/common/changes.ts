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
