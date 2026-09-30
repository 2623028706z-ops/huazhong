// 自定义顶栏的几何（01 章第 3.1 节）：顶栏从状态栏下面开始，右侧给胶囊留白。
// 顶栏高度本身是 tokens 里的 --hz-nav，这里只量手机给的状态栏和胶囊位置。

export interface NavLayout {
  // 状态栏高度：顶栏从这里开始
  statusBar: number
  // 顶栏右侧留白：胶囊左边到屏幕右边
  capsuleGap: number
}

let cached: NavLayout | null = null

export function navLayout(): NavLayout {
  if (cached) return cached
  const { statusBarHeight, windowWidth } = wx.getWindowInfo()
  const capsule = wx.getMenuButtonBoundingClientRect()
  cached = { statusBar: statusBarHeight, capsuleGap: windowWidth - capsule.left }
  return cached
}
