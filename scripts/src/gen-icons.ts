// 图标字体（02 章第 3 节）：Lucide 线性图标按需生成，描边转成填充轮廓，写进 miniapp/miniprogram/styles/iconfont.wxss
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { CanvasKit, Path } from 'canvaskit-wasm'
import svg2ttf from 'svg2ttf'
import { SVGIcons2SVGFontStream, type SVGIconStream } from 'svgicons2svgfont'
import { miniprogramDir, type Output } from './generated.ts'
import { toNonZero } from './winding.ts'

// 先放原型用到的；新页面要用新图标时加在这里，再跑 pnpm gen
export const ICONS = [
  'house',
  'shopping-bag',
  'shopping-cart',
  'truck',
  'clipboard-list',
  'boxes',
  'wallet',
  'receipt',
  'send',
  'flower-2',
  'user-round',
  'chevron-left',
  'chevron-right',
  'search',
  'x',
  'plus',
  'minus',
  'trash-2',
  'log-out',
  'info',
  'store',
  'image',
  'check',
] as const

// 24 网格上的线宽：显示 21px 时约 1.5px
const STROKE_WIDTH = 1.7
const FONT_HEIGHT = 1000
const FIRST_CODEPOINT = 0xe001
const HEX = 16
const require = createRequire(import.meta.url)
// canvaskit-wasm 是 CommonJS，module.exports 就是初始化函数
export const initCanvasKit = require('canvaskit-wasm') as () => Promise<CanvasKit>
const iconDir = join(require.resolve('lucide-static/package.json'), '../icons')

function attr(tag: string, name: string): number {
  const match = new RegExp(`\\s${name}="([^"]+)"`).exec(tag)
  return match?.[1] ? Number(match[1]) : 0
}

// 把 Lucide 用到的几种图形都换成 path
function toPathData(tag: string): string {
  const kind = /^<(\w+)/.exec(tag)?.[1]
  if (kind === 'path') return /\sd="([^"]+)"/.exec(tag)?.[1] ?? ''
  if (kind === 'circle') {
    const [cx, cy, r] = [attr(tag, 'cx'), attr(tag, 'cy'), attr(tag, 'r')]
    const diameter = 2 * r
    return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${diameter} 0a${r} ${r} 0 1 0 ${-diameter} 0z`
  }
  if (kind === 'rect') {
    const [x, y, rx] = [attr(tag, 'x'), attr(tag, 'y'), attr(tag, 'rx')]
    const width = attr(tag, 'width') - 2 * rx
    const height = attr(tag, 'height') - 2 * rx
    const arc = (dx: number, dy: number) => `a${rx} ${rx} 0 0 1 ${dx} ${dy}`
    return `M${x + rx} ${y}h${width}${arc(rx, rx)}v${height}${arc(-rx, rx)}h${-width}${arc(-rx, -rx)}v${-height}${arc(rx, -rx)}z`
  }
  throw new Error(`Unsupported SVG element in icon: ${tag}`)
}

// 图标的填充轮廓：每条线描边后合并成一条路径（按非零规则填充，字体只认这个规则）
export function outlinePath(ck: CanvasKit, name: string): Path {
  const svg = readFileSync(join(iconDir, `${name}.svg`), 'utf8')
  const tags = svg.match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g) ?? []
  if (tags.length === 0) throw new Error(`Icon ${name} has no shapes`)
  const stroke = { width: STROKE_WIDTH, cap: ck.StrokeCap.Round, join: ck.StrokeJoin.Round }
  let merged = new ck.Path()
  for (const tag of tags) {
    const stroked = ck.Path.MakeFromSVGString(toPathData(tag))?.makeStroked(stroke) ?? null
    const union = stroked ? ck.Path.MakeFromOp(merged, stroked, ck.PathOp.Union) : null
    if (!union) throw new Error(`Cannot stroke ${name}: ${tag}`)
    merged = union
  }
  // 经 SVG 字符串转一次：圆角里的圆锥曲线（conic）变成字体支持的二次曲线
  const quadratic = ck.Path.MakeFromSVGString(merged.toSVGString())
  if (!quadratic) throw new Error(`Cannot convert ${name}`)
  return toNonZero(ck, quadratic)
}

function outline(ck: CanvasKit, name: string): string {
  const d = outlinePath(ck, name).toSVGString()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}"/></svg>`
}

function iconStream(svg: string, name: string, index: number): SVGIconStream {
  const stream = Readable.from([svg]) as SVGIconStream
  stream.metadata = { name, unicode: [String.fromCodePoint(FIRST_CODEPOINT + index)] }
  return stream
}

async function svgFont(ck: CanvasKit): Promise<string> {
  const fontStream = new SVGIcons2SVGFontStream({
    fontName: 'hz-icon',
    fontHeight: FONT_HEIGHT,
    normalize: true,
  })
  const chunks: string[] = []
  fontStream.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()))
  const done = new Promise<void>((resolve, reject) => {
    fontStream.on('end', resolve).on('error', reject)
  })
  ICONS.forEach((name, index) => fontStream.write(iconStream(outline(ck, name), name, index)))
  fontStream.end()
  await done
  return chunks.join('')
}

// 轮廓算法变了也要改这里（nonzero：按层定方向），让 gen:check 发现字体过期
const fingerprint = `/* icons: ${ICONS.join(' ')} | stroke ${String(STROKE_WIDTH)} | nonzero */`

async function content(): Promise<string> {
  const ttf = svg2ttf(await svgFont(await initCanvasKit()), { ts: 0 })
  const base64 = Buffer.from(ttf.buffer).toString('base64')
  const rules = ICONS.map(
    (name, index) =>
      `.hz-icon--${name}::before {\n  content: '\\${(FIRST_CODEPOINT + index).toString(HEX)}';\n}`,
  )
  return [
    '/* Generated file, do not edit. Source: scripts/src/gen-icons.ts (pnpm gen) */',
    fingerprint,
    `@font-face {\n  font-family: hz-icon;\n  src: url('data:font/ttf;base64,${base64}') format('truetype');\n}`,
    '.hz-icon {\n  font-family: hz-icon;\n  font-style: normal;\n  line-height: 1;\n  -webkit-font-smoothing: antialiased;\n}',
    ...rules,
    '',
  ].join('\n\n')
}

export const iconOutput: Output = {
  file: join(miniprogramDir, 'styles/iconfont.wxss'),
  content,
  fingerprint,
}

// 图标名清单给小程序代码用（组件总览列出全部图标），和字体同一个出处
const namesContent = [
  '// Generated file, do not edit. Source: scripts/src/gen-icons.ts (pnpm gen)',
  'export const iconNames = [',
  ...ICONS.map((name) => `  '${name}',`),
  '] as const',
  '',
].join('\n')

export const iconNamesOutput: Output = {
  file: join(miniprogramDir, 'core/icon-names.ts'),
  content: () => Promise.resolve(namesContent),
  fingerprint: namesContent,
}
