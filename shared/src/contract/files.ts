// 图片上传（05 章第 11 节）：申请签名 → wx.uploadFile 直传 → complete → 表单里带 fileId。
// 门店传售后图片，销售传产品图；业务接口只接受 status=ok 的 fileId
import * as z from 'zod'
import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from '../config.ts'
import { copy } from '../copy.ts'
import { filePurposes, fileStatuses } from '../enums.ts'
import { idSchema, timestampSchema } from '../rules.ts'
import type { Endpoint } from './endpoint.ts'
import { idParamsSchema } from './page.ts'

export const requestUploadTicket = {
  method: 'POST',
  path: '/files/upload-ticket',
  grants: ['store', 'sales'],
  body: z.object({
    purpose: z.enum(filePurposes),
    mime: z.enum(IMAGE_MIME_TYPES, { error: copy.file.badType }),
    sizeBytes: z.number().int().positive().max(IMAGE_MAX_BYTES, { error: copy.file.tooLarge }),
  }),
  // wx.uploadFile 用 uploadUrl + formData（文件字段名 file）
  response: z.object({
    fileId: idSchema,
    uploadUrl: z.string(),
    formData: z.record(z.string(), z.string()),
    expiresAt: timestampSchema,
  }),
  errors: [],
} as const satisfies Endpoint

export const completeUpload = {
  method: 'POST',
  path: '/files/:id/complete',
  grants: ['store', 'sales'],
  params: idParamsSchema,
  response: z.object({
    status: z.enum(fileStatuses),
    url: z.string(),
    thumbUrl: z.string(),
  }),
  errors: ['NOT_FOUND', 'BUSINESS_RULE'],
} as const satisfies Endpoint
