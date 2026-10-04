// 单据图片从视觉 token 读取颜色，内容逐字换行后计算完整画布高度。
import { redesignCopy } from '@huazhong/shared'
import { showSuccess } from './toast'
export type DocumentImageRow = string | { label: string; value: string }
const FIELD_WIDTH = 180
interface ImageLine {
  text: string
  label?: string
}
const WIDTH = 720,
  PAD = 36,
  LINE_HEIGHT = 36,
  BODY_TOP = 140,
  BOTTOM = 40,
  TITLE_TOP = 68,
  RULE_TOP = 98,
  ACCENT_HEIGHT = 8
interface CanvasResult {
  node?: WechatMiniprogram.Canvas
  color: string
  'background-color': string
  'border-top-color': string
}
function canvasOf(page: WechatMiniprogram.Page.TrivialInstance): Promise<CanvasResult> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(page)
      .select('#documentCanvas')
      .fields(
        { node: true, computedStyle: ['color', 'background-color', 'border-top-color'] },
        (value: unknown) => {
          const found = value as CanvasResult | null
          if (found?.node) resolve(found)
          else reject(new Error('Canvas unavailable'))
        },
      )
      .exec()
  })
}
function wrap(
  text: string,
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  width = WIDTH - PAD * 2,
): string[] {
  const lines: string[] = []
  let line = ''
  for (const char of text) {
    if (line && context.measureText(line + char).width > width) {
      lines.push(line)
      line = ''
    }
    line += char
  }
  lines.push(line)
  return lines
}
function imageLines(
  rows: readonly DocumentImageRow[],
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
): ImageLine[] {
  return rows.flatMap((row) => {
    if (typeof row === 'string')
      return row.split('\n').flatMap((text) => wrap(text, context).map((text) => ({ text })))
    const lines = row.value
      .split('\n')
      .flatMap((text) => wrap(text, context, WIDTH - PAD * 2 - FIELD_WIDTH))
    return lines.map((text, index) => ({ text, label: index === 0 ? row.label : '' }))
  })
}
function paint(
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D,
  result: CanvasResult,
  lines: ImageLine[],
  options: { height: number; title: string },
) {
  const { height, title } = options
  context.fillStyle = result['background-color']
  context.fillRect(0, 0, WIDTH, height)
  context.fillStyle = result['border-top-color']
  context.fillRect(0, 0, WIDTH, ACCENT_HEIGHT)
  context.fillStyle = result.color
  context.font = '500 34px "HZ Serif", serif'
  context.fillText(title, PAD, TITLE_TOP)
  context.fillRect(PAD, RULE_TOP, WIDTH - PAD * 2, 1)
  context.font = '24px sans-serif'
  lines.forEach((line, index) => {
    const y = BODY_TOP + index * LINE_HEIGHT
    context.font = '24px sans-serif'
    context.textAlign = 'left'
    if (line.label !== undefined) {
      context.fillText(line.label, PAD, y)
      context.textAlign = 'right'
    }
    if (line.text.startsWith('¥')) context.font = '600 24px "HZ Serif", serif'
    context.fillText(line.text, line.label !== undefined ? WIDTH - PAD : PAD, y)
  })
}
export async function renderDocumentImage(
  page: WechatMiniprogram.Page.TrivialInstance,
  rows: readonly DocumentImageRow[],
  title: string,
): Promise<string> {
  const result = await canvasOf(page)
  const canvas = result.node
  if (!canvas) throw new Error('Canvas unavailable')
  const context = canvas.getContext('2d')
  context.font = '24px sans-serif'
  const lines = imageLines(rows, context),
    height = BODY_TOP + lines.length * LINE_HEIGHT + BOTTOM
  canvas.width = WIDTH
  canvas.height = height
  paint(context, result, lines, { height, title })
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath(
      {
        canvas,
        width: WIDTH,
        height,
        destWidth: WIDTH,
        destHeight: height,
        fileType: 'png',
        success: (result) => {
          resolve(result.tempFilePath)
        },
        fail: reject,
      },
      page,
    )
  })
}
export async function saveDocumentImage(path: string): Promise<void> {
  await wx.saveImageToPhotosAlbum({ filePath: path })
  showSuccess(redesignCopy.savedImage)
}
export async function shareDocumentImage(path: string): Promise<void> {
  await wx.showShareImageMenu({ path })
}
