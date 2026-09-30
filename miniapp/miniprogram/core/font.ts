// 思源宋体子集：app.onLaunch 全局加载，加载完成前用 tokens 里 --hz-serif 的后备字体，不阻塞页面（02 章第 3 节）
import { fontFaces } from './font-data'

const FAMILY = 'HZ Serif'

export function loadSerifFont(): void {
  for (const face of fontFaces) {
    wx.loadFontFace({
      global: true,
      family: FAMILY,
      source: `url("${face.source}")`,
      desc: { weight: face.weight },
      // 加载失败只影响字形（退回系统宋体），记到实时日志里排查
      fail: (result) => {
        wx.getRealtimeLogManager().error('loadFontFace', face.weight, result)
      },
    })
  }
}
