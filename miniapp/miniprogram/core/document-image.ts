// 单据图片（对账单、送货单共用）：按「抬头 + 信息行 + 表格 + 合计 + 签字」的版式画在离屏画布上。
// 颜色从页面里一个隐藏元素的样式读（取 tokens.wxss 的变量，不在这里写色值）；
// 按设备像素比放大（至少 2 倍），等宋体字加载完再画，避免真机糊或字体不对。
import { redesignCopy } from '@huazhong/shared'
import { fontReady } from './font'
import { showSuccess } from './toast'

interface TableColumn {
  weight: number
  align: 'left' | 'right'
  muted?: boolean
}
type TableRow = string[] | { cells: string[]; strong: true }
export type DocumentBlock =
  | { kind: 'table'; columns: TableColumn[]; head: string[]; rows: TableRow[] }
  | { kind: 'sum'; label: string; value: string; strong?: boolean }
  | { kind: 'rule' }
  | { kind: 'note'; text: string }
  | { kind: 'sign'; labels: string[] }
export interface DocumentImage {
  title: string
  brand: string
  /** 信息行，每个元素是一整行（几项之间用全角空格隔开），太长会自动换行 */
  meta: string[]
  blocks: DocumentBlock[]
}

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
interface Colors {
  ink: string
  paper: string
  wall: string
  brand: string
  muted: string
  hair: string
}
// 版式尺寸（逻辑像素，画布按像素比放大）
const D = {
  width: 720,
  margin: 24,
  pad: 36,
  radius: 20,
  size: 26,
  small: 22,
  title: 40,
  line: 40,
  row: 56,
  rowText: 38,
  rowPad: 16,
  cellGap: 12,
  gapTitle: 24,
  gapRule: 24,
  noteLine: 34,
  noteBase: 24,
  sumBase: 36,
  sumRow: 48,
  signTop: 40,
  signBase: 26,
  signLine: 44,
  signRow: 56,
  signGap: 24,
  metaBase: 28,
  metaAfter: 8,
  accent: 48,
  accentHeight: 4,
  strong: 600,
  normal: 400,
  medium: 500,
  maxRatio: 3,
  probeHeight: 100,
}
const INNER = D.width - (D.margin + D.pad) * 2,
  LEFT = D.margin + D.pad,
  RIGHT = D.width - D.margin - D.pad
const SANS = '"PingFang SC", "Helvetica Neue", sans-serif'
const SERIF = '"HZ Serif", "Songti SC", serif'
interface Pen {
  context: Context
  colors: Colors | null
  y: number
}
interface Point {
  x: number
  y: number
}
interface Box extends Point {
  width: number
  height: number
}
interface TextStyle {
  size?: number
  weight?: number
  serif?: boolean
  muted?: boolean
  right?: boolean
}

function colorsOf(page: WechatMiniprogram.Page.TrivialInstance): Promise<Colors> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select('#documentColors')
      .fields(
        {
          computedStyle: [
            'color',
            'background-color',
            'border-top-color',
            'border-bottom-color',
            'border-left-color',
            'border-right-color',
          ],
        },
        (value: unknown) => {
          const found = value as Record<string, string> | null
          if (!found?.color) {
            reject(new Error('Colors unavailable'))
            return
          }
          resolve({
            ink: found.color,
            paper: found['background-color'] ?? '',
            brand: found['border-top-color'] ?? '',
            muted: found['border-bottom-color'] ?? '',
            wall: found['border-left-color'] ?? '',
            hair: found['border-right-color'] ?? '',
          })
        },
      )
      .exec()
  })
}
function wrap(context: Context, text: string, width: number): string[] {
  const lines: string[] = []
  for (const part of text.split('\n')) {
    let line = ''
    for (const char of part) {
      if (line && context.measureText(line + char).width > width) {
        lines.push(line)
        line = ''
      }
      line += char
    }
    lines.push(line)
  }
  return lines
}
function fontOf(size: number, weight = 400, serif = false) {
  return `${weight} ${size}px ${serif ? SERIF : SANS}`
}
function text(pen: Pen, value: string, at: Point, style: TextStyle = {}) {
  pen.context.font = fontOf(style.size ?? D.size, style.weight, style.serif)
  if (!pen.colors) return
  pen.context.fillStyle = style.muted ? pen.colors.muted : pen.colors.ink
  pen.context.textAlign = style.right ? 'right' : 'left'
  pen.context.fillText(value, at.x, at.y)
}
function fill(pen: Pen, color: keyof Colors, box: Box) {
  if (!pen.colors) return
  pen.context.fillStyle = pen.colors[color]
  pen.context.fillRect(box.x, box.y, box.width, box.height)
}
function rule(pen: Pen) {
  fill(pen, 'hair', { x: LEFT, y: pen.y, width: INNER, height: 1 })
  pen.y += D.gapRule
}
function header(pen: Pen, doc: DocumentImage) {
  pen.y = D.margin + D.pad
  text(
    pen,
    doc.title,
    { x: LEFT, y: pen.y + D.title },
    { size: D.title, weight: D.medium, serif: true },
  )
  text(
    pen,
    doc.brand,
    { x: RIGHT, y: pen.y + D.title - D.accentHeight },
    {
      size: D.small,
      muted: true,
      right: true,
    },
  )
  pen.y += D.title + D.gapTitle
  pen.context.font = fontOf(D.size)
  for (const meta of doc.meta)
    for (const line of wrap(pen.context, meta, INNER)) {
      text(pen, line, { x: LEFT, y: pen.y + D.metaBase }, { muted: true })
      pen.y += D.line
    }
  pen.y += D.metaAfter
  rule(pen)
}
function note(pen: Pen, value: string) {
  pen.context.font = fontOf(D.small)
  for (const line of wrap(pen.context, value, INNER)) {
    text(pen, line, { x: LEFT, y: pen.y + D.noteBase }, { size: D.small, muted: true })
    pen.y += D.noteLine
  }
  pen.y += D.metaAfter
}
function sum(pen: Pen, block: Extract<DocumentBlock, { kind: 'sum' }>) {
  const weight = block.strong ? D.strong : undefined
  text(pen, block.label, { x: LEFT, y: pen.y + D.sumBase }, weight ? { weight } : {})
  text(
    pen,
    block.value,
    { x: RIGHT, y: pen.y + D.sumBase },
    {
      serif: true,
      right: true,
      ...(weight ? { weight } : {}),
    },
  )
  pen.y += D.sumRow
}
function sign(pen: Pen, block: Extract<DocumentBlock, { kind: 'sign' }>) {
  const width = (INNER - D.signGap * (block.labels.length - 1)) / block.labels.length
  pen.y += D.signTop
  block.labels.forEach((label, index) => {
    const x = LEFT + index * (width + D.signGap)
    text(pen, label, { x, y: pen.y + D.signBase }, { muted: true })
    fill(pen, 'hair', { x, y: pen.y + D.signLine, width, height: 2 })
  })
  pen.y += D.signRow
}
function columnsOf(columns: TableColumn[]) {
  const total = columns.reduce((acc, column) => acc + column.weight, 0)
  let start = LEFT
  return columns.map((column) => {
    const width = (INNER * column.weight) / total,
      cell = { start, width }
    start += width
    return cell
  })
}
function tableRow(
  pen: Pen,
  block: Extract<DocumentBlock, { kind: 'table' }>,
  cells: string[],
  mode: { strong?: boolean; head?: boolean },
) {
  const xs = columnsOf(block.columns),
    weight = mode.strong ? D.strong : D.normal
  pen.context.font = fontOf(D.size, weight)
  const wrapped = cells.map((cell, index) => {
    const column = block.columns[index],
      width = xs[index]?.width ?? INNER
    return wrap(pen.context, cell, column?.align === 'right' ? width : width - D.cellGap)
  })
  wrapped.forEach((lines, index) => {
    const column = block.columns[index],
      box = xs[index]
    if (!column || !box) return
    const right = column.align === 'right'
    lines.forEach((line, lineIndex) => {
      text(
        pen,
        line,
        { x: right ? box.start + box.width : box.start, y: pen.y + D.rowText + lineIndex * D.line },
        {
          weight,
          serif: !mode.head && /^[−-]?¥/.test(line),
          right,
          muted: Boolean(mode.head || column.muted),
        },
      )
    })
  })
  const count = Math.max(...wrapped.map((lines) => lines.length))
  pen.y += Math.max(D.row, count * D.line + D.rowPad)
}
function table(pen: Pen, block: Extract<DocumentBlock, { kind: 'table' }>) {
  tableRow(pen, block, block.head, { head: true })
  for (const item of block.rows)
    tableRow(pen, block, Array.isArray(item) ? item : item.cells, { strong: !Array.isArray(item) })
}
function block(pen: Pen, item: DocumentBlock) {
  if (item.kind === 'rule') rule(pen)
  else if (item.kind === 'note') note(pen, item.text)
  else if (item.kind === 'sum') sum(pen, item)
  else if (item.kind === 'sign') sign(pen, item)
  else table(pen, item)
}
// 画（colors 为 null 时只量不画）整张图，返回卡片内容底部的 y
function layout(context: Context, doc: DocumentImage, colors: Colors | null): number {
  const pen: Pen = { context, colors, y: 0 }
  header(pen, doc)
  for (const item of doc.blocks) block(pen, item)
  return pen.y
}
function cardPath(context: Context, height: number) {
  const { margin, radius, width } = D
  context.beginPath()
  context.moveTo(margin + radius, margin)
  context.arcTo(width - margin, margin, width - margin, height - margin, radius)
  context.arcTo(width - margin, height - margin, margin, height - margin, radius)
  context.arcTo(margin, height - margin, margin, margin, radius)
  context.arcTo(margin, margin, width - margin, margin, radius)
  context.closePath()
}
function paintCard(context: Context, colors: Colors, height: number) {
  context.fillStyle = colors.wall
  context.fillRect(0, 0, D.width, height)
  context.fillStyle = colors.paper
  context.strokeStyle = colors.hair
  context.lineWidth = 1
  cardPath(context, height)
  context.fill()
  context.stroke()
  // 卡片左上角一小段品牌色短线
  context.fillStyle = colors.brand
  context.fillRect(LEFT, D.margin, D.accent, D.accentHeight)
}
export async function renderDocumentImage(
  page: WechatMiniprogram.Page.TrivialInstance,
  doc: DocumentImage,
): Promise<string> {
  const [colors] = await Promise.all([colorsOf(page), fontReady()])
  const ratio = Math.min(D.maxRatio, Math.max(2, wx.getWindowInfo().pixelRatio)),
    canvas = wx.createOffscreenCanvas({ type: '2d', width: D.width, height: D.probeHeight }),
    context = canvas.getContext('2d') as unknown as Context
  const height = Math.ceil(layout(context, doc, null) + D.pad + D.margin)
  canvas.width = D.width * ratio
  canvas.height = height * ratio
  context.scale(ratio, ratio)
  paintCard(context, colors, height)
  layout(context, doc, colors)
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: D.width * ratio,
      height: height * ratio,
      destWidth: D.width * ratio,
      destHeight: height * ratio,
      fileType: 'png',
      success: (result) => {
        resolve(result.tempFilePath)
      },
      fail: reject,
    })
  })
}
export async function saveDocumentImage(path: string): Promise<void> {
  await wx.saveImageToPhotosAlbum({ filePath: path })
  showSuccess(redesignCopy.savedImage)
}
export async function shareDocumentImage(path: string): Promise<void> {
  await wx.showShareImageMenu({ path })
}
