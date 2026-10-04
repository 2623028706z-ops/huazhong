// 图片上传（05 章第 11 节）：申请签名 → wx.uploadFile 直传 → complete → 表单里带 fileId
import { contract, copy, type FilePurpose } from '@huazhong/shared'
import { request, type Failure } from './request'

const mimeOfExtension: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export interface LocalImage {
  url: string
  size: number
}

export interface UploadedImage {
  fileId: string
  url: string
  thumbUrl: string
}

export type UploadResult =
  { ok: true; image: UploadedImage } | { ok: false; message: string; failure: Failure | null }

const HTTP_OK_MIN = 200
const HTTP_OK_END = 300

function extensionOf(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1).toLowerCase()
}

function put(url: string, filePath: string, formData: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    wx.uploadFile({
      url,
      filePath,
      name: 'file',
      formData,
      success: (res) => {
        resolve(res.statusCode >= HTTP_OK_MIN && res.statusCode < HTTP_OK_END)
      },
      fail: () => {
        resolve(false)
      },
    })
  })
}

export async function uploadImage(purpose: FilePurpose, file: LocalImage): Promise<UploadResult> {
  const mime = mimeOfExtension[extensionOf(file.url)]
  if (!mime) return { ok: false, message: copy.file.badType, failure: null }
  const ticket = await request(contract.requestUploadTicket, {
    body: { purpose, mime, sizeBytes: file.size },
  })
  if (!ticket.ok) return { ok: false, message: copy.file.missing, failure: ticket.failure }
  const sent = await put(ticket.data.uploadUrl, file.url, ticket.data.formData)
  if (!sent) return { ok: false, message: copy.file.missing, failure: null }
  const done = await request(contract.completeUpload, { params: { id: ticket.data.fileId } })
  if (!done.ok) return { ok: false, message: copy.file.missing, failure: done.failure }
  const { url, thumbUrl } = done.data
  return { ok: true, image: { fileId: ticket.data.fileId, url, thumbUrl } }
}
