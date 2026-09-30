// 描边合并（PathOp）的结果按奇偶规则填充，字体只认非零规则：直接放进字体，洞会被填实。
// 这里按嵌套层数给每条轮廓定方向（外轮廓一个方向，洞反过来，洞里的实心再反回来），
// 这样非零规则和奇偶规则画出来一样。Skia 的 makeAsWinding 对部分图标会原样返回，不能用。
import type { CanvasKit, Path } from 'canvaskit-wasm'

type Point = readonly [number, number]
interface Segment {
  verb: number
  // 控制点在前，终点在最后
  points: Point[]
}
interface Contour {
  start: Point
  segments: Segment[]
}

// 每条曲线取几个点算有向面积
const SAMPLES = 8

function pairs(values: number[]): Point[] {
  const points: Point[] = []
  for (let i = 0; i + 1 < values.length; i += 2) points.push([values[i] ?? 0, values[i + 1] ?? 0])
  return points
}

// 每种命令带几个点（二次曲线一个控制点、三次两个，再加终点）；每个点两个坐标
const CUBIC_POINTS = 3
function coordinateCount(ck: CanvasKit, verb: number): number {
  const points = new Map([
    [ck.MOVE_VERB, 1],
    [ck.LINE_VERB, 1],
    [ck.QUAD_VERB, 2],
    [ck.CUBIC_VERB, CUBIC_POINTS],
    [ck.CLOSE_VERB, 0],
  ])
  const count = points.get(verb)
  if (count === undefined) throw new Error(`Unsupported path verb: ${String(verb)}`)
  return count * 2
}

function endOf(contour: Contour): Point {
  return contour.segments.at(-1)?.points.at(-1) ?? contour.start
}

function same(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

// 拆成一条条闭合轮廓；没回到起点的补一条直线
function splitContours(ck: CanvasKit, path: Path): Contour[] {
  const cmds = Array.from(path.toCmds())
  const contours: Contour[] = []
  for (let i = 0; i < cmds.length;) {
    const verb = cmds[i] ?? ck.CLOSE_VERB
    const count = coordinateCount(ck, verb)
    const points = pairs(cmds.slice(i + 1, i + 1 + count))
    i += 1 + count
    const [first] = points
    if (verb === ck.MOVE_VERB && first) contours.push({ start: first, segments: [] })
    else if (verb !== ck.CLOSE_VERB) contours.at(-1)?.segments.push({ verb, points })
  }
  for (const contour of contours) {
    if (!same(endOf(contour), contour.start))
      contour.segments.push({ verb: ck.LINE_VERB, points: [contour.start] })
  }
  return contours.filter((contour) => contour.segments.length > 0)
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// de Casteljau：直线、二次、三次曲线通用
function bezier(points: Point[], t: number): Point {
  let current = points
  while (current.length > 1) {
    const previous = current
    current = previous.slice(1).map((point, k) => lerp(previous[k] ?? point, point, t))
  }
  return current[0] ?? [0, 0]
}

function signedArea(contour: Contour): number {
  const polygon: Point[] = []
  let from = contour.start
  for (const segment of contour.segments) {
    for (let s = 1; s <= SAMPLES; s++) polygon.push(bezier([from, ...segment.points], s / SAMPLES))
    from = segment.points.at(-1) ?? from
  }
  let twice = 0
  polygon.forEach((point, k) => {
    const next = polygon[(k + 1) % polygon.length] ?? point
    twice += point[0] * next[1] - next[0] * point[1]
  })
  return twice / 2
}

function reverse(contour: Contour): Contour {
  const starts = [contour.start, ...contour.segments.map((segment) => segment.points.at(-1))]
  const segments = contour.segments.map((segment, k) => ({
    verb: segment.verb,
    points: [...segment.points.slice(0, -1).reverse(), starts[k] ?? contour.start],
  }))
  return { start: contour.start, segments: segments.reverse() }
}

function toCmds(ck: CanvasKit, contour: Contour): number[] {
  return [
    ck.MOVE_VERB,
    ...contour.start,
    ...contour.segments.flatMap((segment) => [segment.verb, ...segment.points.flat()]),
    ck.CLOSE_VERB,
  ]
}

function toPath(ck: CanvasKit, cmds: number[]): Path {
  const path = ck.Path.MakeFromCmds(cmds)
  if (!path) throw new Error('Cannot rebuild icon path')
  return path
}

// 轮廓之间不相交（PathOp 的结果），用起点判断被几条轮廓包住
export function toNonZero(ck: CanvasKit, evenOdd: Path): Path {
  const contours = splitContours(ck, evenOdd)
  const shapes = contours.map((contour) => toPath(ck, toCmds(ck, contour)))
  const oriented = contours.map((contour, index) => {
    const [x, y] = contour.start
    const depth = shapes.filter((shape, other) => other !== index && shape.contains(x, y)).length
    const wanted = depth % 2 === 0 ? 1 : -1
    return Math.sign(signedArea(contour)) === wanted ? contour : reverse(contour)
  })
  const result = toPath(
    ck,
    oriented.flatMap((contour) => toCmds(ck, contour)),
  )
  result.setFillType(ck.FillType.Winding)
  return result
}
