// 分享链接里的随机 token：库里只存 SHA-256（04 章第 4.8 节）
import { createHash, randomBytes } from 'node:crypto'

export function newToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function snapshotToken(value: unknown): string {
  return hashToken(JSON.stringify(value))
}
