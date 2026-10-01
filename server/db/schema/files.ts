// 上传的文件（04 章第 3.4 节）：上传完成登记，内容安全检测结果写 status；
// 业务表只能引用 status='ok' 的文件。created_by 就是上传人
import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text } from 'drizzle-orm/pg-core'
import { commonColumns } from './columns.ts'
import { filePurpose, fileStatus } from './enums.ts'

export const files = pgTable(
  'files',
  {
    ...commonColumns(),
    purpose: filePurpose().notNull(),
    cosKey: text().notNull().unique(),
    thumbKey: text(),
    sizeBytes: integer().notNull(),
    mime: text().notNull(),
    status: fileStatus().notNull().default('pending'),
  },
  (t) => [check('files_size_positive', sql`${t.sizeBytes} > 0`)],
)
