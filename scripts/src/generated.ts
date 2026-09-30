// 生成物的公共部分：输出路径、写入或比对
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
export const miniprogramDir = join(repoRoot, 'miniapp/miniprogram')
export const cacheDir = join(repoRoot, 'scripts/.cache')

// 一个生成物：content 是要写入的全文；fingerprint 是 --check 时比对的部分
// （字体、图标比对清单即可，不必重新下载字体、重新生成二进制）
export interface Output {
  file: string
  content: () => Promise<string>
  fingerprint: string
}

function readCommitted(file: string): string {
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

export async function writeOutput(output: Output): Promise<void> {
  writeFileSync(output.file, await output.content())
}

export function isFresh(output: Output): boolean {
  return readCommitted(output.file).includes(output.fingerprint)
}
