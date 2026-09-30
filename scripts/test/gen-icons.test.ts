import type { CanvasKit, Path } from 'canvaskit-wasm'
import { beforeAll, describe, expect, it } from 'vitest'
import { ICONS, initCanvasKit, outlinePath } from '../src/gen-icons.ts'
import { toNonZero } from '../src/winding.ts'

let ck: CanvasKit

beforeAll(async () => {
  ck = await initCanvasKit()
})

// 24×24 的图标放大 4 倍画出来，数被填上的像素
const SIZE = 96
function filledPixels(path: Path, fill: 'nonzero' | 'evenodd'): number {
  const shape = path.copy()
  shape.setFillType(fill === 'nonzero' ? ck.FillType.Winding : ck.FillType.EvenOdd)
  const surface = ck.MakeSurface(SIZE, SIZE)
  if (!surface) throw new Error('No surface')
  const canvas = surface.getCanvas()
  canvas.clear(ck.WHITE)
  canvas.scale(SIZE / 24, SIZE / 24)
  const paint = new ck.Paint()
  paint.setColor(ck.BLACK)
  paint.setAntiAlias(false)
  canvas.drawPath(shape, paint)
  const pixels = canvas.readPixels(0, 0, {
    width: SIZE,
    height: SIZE,
    colorType: ck.ColorType.RGBA_8888,
    alphaType: ck.AlphaType.Unpremul,
    colorSpace: ck.ColorSpace.SRGB,
  })
  let count = 0
  for (let i = 0; i < (pixels?.length ?? 0); i += 4) if ((pixels?.[i] ?? 255) < 128) count++
  surface.delete()
  return count
}

describe('图标字体的轮廓', () => {
  it('两条同向的方框叠在一起：转换后中间是空的', () => {
    const sameDirection = ck.Path.MakeFromSVGString('M2 2H22V22H2Z M6 6H18V18H6Z')
    if (!sameDirection) throw new Error('Bad path')
    const fixed = toNonZero(ck, sameDirection)
    // 外框 2–22 放大后是 80×80，洞 6–18 是 48×48
    expect(filledPixels(sameDirection, 'nonzero')).toBe(80 * 80)
    expect(filledPixels(fixed, 'nonzero')).toBe(80 * 80 - 48 * 48)
  })

  it.each(ICONS)('%s 的镂空按字体的非零规则也保留着', (name) => {
    const path = outlinePath(ck, name)
    expect(filledPixels(path, 'nonzero')).toBe(filledPixels(path, 'evenodd'))
  })
})
