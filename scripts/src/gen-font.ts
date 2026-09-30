// 思源宋体子集（02 章第 3 节）：标题 500、金额 600 两档，写成 base64 放进 miniapp/miniprogram/core/font-data.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import subsetFont from 'subset-font'
import { copy, labels } from '@huazhong/shared'
import { cacheDir, miniprogramDir, type Output } from './generated.ts'

const FONT_URL =
  'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf'
const FONT_CACHE = join(cacheDir, 'NotoSerifSC-wght.ttf')
const TITLE_WEIGHT = 500
const AMOUNT_WEIGHT = 600
const DIGITS = '0123456789'
const AMOUNT_EXTRA = '¥,.−'

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf)
  return []
}

function uniqueChars(text: string): string {
  return [...new Set(text)]
    .filter((char) => char.trim() !== '')
    .sort()
    .join('')
}

// 标题字：模块名 + 页面标题 + 衬线显示的整页状态和确认框 + 全部文案里出现的标点
function titleCharset(): string {
  const serifCopy = [copy.title, copy.state, copy.confirm, copy.error, copy.network]
  const titles = [...stringsOf(labels.module), ...serifCopy.flatMap(stringsOf)].join('')
  const punctuation = stringsOf(copy)
    .join('')
    .replace(/[^\p{P}\p{S}]/gu, '')
  return uniqueChars(DIGITS + AMOUNT_EXTRA + titles + punctuation)
}

function amountCharset(): string {
  return uniqueChars(DIGITS + AMOUNT_EXTRA)
}

async function sourceFont(): Promise<Buffer> {
  if (!existsSync(FONT_CACHE)) {
    const response = await fetch(FONT_URL)
    if (!response.ok) throw new Error(`Font download failed: ${String(response.status)}`)
    mkdirSync(cacheDir, { recursive: true })
    writeFileSync(FONT_CACHE, Buffer.from(await response.arrayBuffer()))
  }
  return readFileSync(FONT_CACHE)
}

async function face(font: Buffer, text: string, weight: number): Promise<string> {
  const woff = await subsetFont(font, text, {
    targetFormat: 'woff',
    variationAxes: { wght: weight },
  })
  return `  { weight: '${String(weight)}', source: 'data:font/woff;base64,${woff.toString('base64')}' },`
}

const fingerprint = `// title: ${titleCharset()}\n// amount: ${amountCharset()}\n`

async function content(): Promise<string> {
  const font = await sourceFont()
  const faces = [
    await face(font, titleCharset(), TITLE_WEIGHT),
    await face(font, amountCharset(), AMOUNT_WEIGHT),
  ]
  return [
    '// Generated file, do not edit. Source: scripts/src/gen-font.ts (pnpm gen)',
    fingerprint.trimEnd(),
    'export const fontFaces = [',
    ...faces,
    '] as const',
    '',
  ].join('\n')
}

export const fontOutput: Output = {
  file: join(miniprogramDir, 'core/font-data.ts'),
  content,
  fingerprint,
}
