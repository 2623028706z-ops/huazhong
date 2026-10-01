// 图片上传（05 章第 11 节）：申请直传地址 → 小程序直传 → complete；业务接口只接受 status=ok 的文件。
// 别的模块用这里的 assertUsable（表单里带的 fileId）和 urlsOf（详情里的签名地址）
import { randomUUID } from 'node:crypto'
import {
  appError,
  copy,
  UPLOAD_TICKET_TTL_MINUTES,
  type FilePurpose,
  type OutputOf,
  type contract,
} from '@huazhong/shared'
import { Inject, Injectable } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import type { Db, Tx } from '../../../db/client.ts'
import { files } from '../../../db/schema/index.ts'
import { Clock } from '../../common/clock.ts'
import { DB } from '../../common/db.ts'
import type { Viewer } from '../../common/domain/viewer.ts'
import { FileStorage } from '../../common/storage.ts'

const MS_PER_MINUTE = 60_000

export interface FileUrls {
  url: string
  thumbUrl: string
}

interface TicketInput {
  purpose: FilePurpose
  mime: string
  sizeBytes: number
}

// 门店只传售后图片，产品图只有销售传
function canUpload(viewer: Viewer, purpose: FilePurpose): boolean {
  if (viewer.type === 'store') return purpose === 'after_image'
  return viewer.modules.includes('sales')
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: FileStorage,
    private readonly clock: Clock,
  ) {}

  // 只登记一行 pending：还不是业务动作，不写操作日志
  async requestTicket(
    viewer: Viewer,
    input: TicketInput,
  ): Promise<OutputOf<typeof contract.requestUploadTicket>> {
    if (!canUpload(viewer, input.purpose)) throw appError.forbidden()
    const cosKey = `${input.purpose}/${randomUUID()}`
    const [row] = await this.db
      .insert(files)
      .values({ ...input, cosKey, createdBy: viewer.accountId })
      .returning({ id: files.id })
    if (!row) throw appError.internal()
    const target = this.storage.uploadTarget(cosKey, input.mime)
    const expiresAt = new Date(
      this.clock.now().getTime() + UPLOAD_TICKET_TTL_MINUTES * MS_PER_MINUTE,
    )
    return {
      fileId: String(row.id),
      uploadUrl: target.url,
      formData: target.formData,
      expiresAt: expiresAt.toISOString(),
    }
  }

  // 内容安全检测预留：接口未启用时直接 ok；缩略图在阶段 6 接 COS 时由 pg-boss 生成，之前和原图同一个
  async complete(viewer: Viewer, id: number): Promise<OutputOf<typeof contract.completeUpload>> {
    const [row] = await this.db.select().from(files).where(eq(files.id, id))
    if (!row || row.createdBy !== viewer.accountId) throw appError.notFound()
    if (!(await this.storage.exists(row.cosKey))) throw appError.businessRule(copy.file.missing)
    await this.db.update(files).set({ status: 'ok', thumbKey: row.cosKey }).where(eq(files.id, id))
    return { status: 'ok', ...this.urlOf(row.cosKey, row.cosKey) }
  }

  // 表单里带的图片：必须是这个用途、已通过检测；售后图片还必须是本人上传的
  async assertUsable(
    tx: Tx,
    viewer: Viewer,
    purpose: FilePurpose,
    ids: readonly number[],
  ): Promise<void> {
    if (ids.length === 0) return
    const rows = await tx
      .select()
      .from(files)
      .where(inArray(files.id, [...ids]))
    const usable = (row: (typeof rows)[number]) =>
      row.status === 'ok' &&
      row.purpose === purpose &&
      (purpose !== 'after_image' || row.createdBy === viewer.accountId)
    if (rows.length !== new Set(ids).size || !rows.every(usable)) {
      throw appError.businessRule(copy.file.missing)
    }
  }

  // 详情里的临时读取地址（有效 FILE_URL_TTL_MINUTES，签名在 COS 实现里做）
  async urlsOf(executor: Db | Tx, ids: readonly number[]): Promise<Map<number, FileUrls>> {
    const urls = new Map<number, FileUrls>()
    if (ids.length === 0) return urls
    const rows = await executor
      .select({ id: files.id, cosKey: files.cosKey, thumbKey: files.thumbKey })
      .from(files)
      .where(inArray(files.id, [...ids]))
    for (const row of rows) urls.set(row.id, this.urlOf(row.cosKey, row.thumbKey ?? row.cosKey))
    return urls
  }

  private urlOf(key: string, thumbKey: string): FileUrls {
    return { url: this.storage.readUrl(key), thumbUrl: this.storage.readUrl(thumbKey) }
  }
}
