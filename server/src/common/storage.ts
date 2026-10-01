// 图片存储（05 章第 11 节）：申请直传地址、确认对象已上传、临时读取地址。
// 开发和接口测试用内存实现；正式环境的 COS 在阶段 6 接入（08 章）
import { Injectable } from '@nestjs/common'

export interface UploadTarget {
  url: string
  formData: Record<string, string>
}

export abstract class FileStorage {
  abstract uploadTarget(key: string, mime: string): UploadTarget
  abstract exists(key: string): Promise<boolean>
  abstract readUrl(key: string): string
}

// 不会被真的访问的地址：开发期的图片只在接口测试里出现
const MEMORY_ORIGIN = 'https://files.invalid'

@Injectable()
export class MemoryFileStorage extends FileStorage {
  private readonly keys = new Set<string>()

  uploadTarget(key: string, mime: string): UploadTarget {
    return { url: MEMORY_ORIGIN, formData: { key, 'Content-Type': mime } }
  }

  exists(key: string): Promise<boolean> {
    return Promise.resolve(this.keys.has(key))
  }

  readUrl(key: string): string {
    return `${MEMORY_ORIGIN}/${key}`
  }

  // 接口测试模拟「小程序已直传」
  put(key: string): void {
    this.keys.add(key)
  }
}
