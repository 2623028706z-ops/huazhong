// 思源宋体子集：app.onLaunch 全局加载，加载完成前用 tokens 里 --hz-serif 的后备字体，不阻塞页面（02 章第 3 节）
import { fontFaces } from './font-data'

const FAMILY = 'HZ Serif'
const FONT_WAIT_MS = 3000

let loading: Promise<void> = Promise.resolve()

export function loadSerifFont(): void {
  loading = Promise.all(
    fontFaces.map(
      (face) =>
        new Promise<void>((resolve) => {
          wx.loadFontFace({
            global: true,
            family: FAMILY,
            source: `url("${face.source}")`,
            desc: { weight: face.weight },
            success: () => {
              resolve()
            },
            // 加载失败只影响字形（退回系统宋体），记到实时日志里排查
            fail: (result) => {
              wx.getRealtimeLogManager().error('loadFontFace', face.weight, result)
              resolve()
            },
          })
        }),
    ),
  ).then(() => undefined)
}
// 画单据图片前等字体加载完（最多等 3 秒，超时就用后备字体画）
export function fontReady(): Promise<void> {
  return Promise.race([
    loading,
    new Promise<void>((resolve) => {
      setTimeout(resolve, FONT_WAIT_MS)
    }),
  ])
}
