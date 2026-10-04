import { loadSerifFont } from './core/font'
import { realtime, refreshCurrentPage } from './core/live'
import { watchNetwork } from './core/network'

const LOGIN_ROUTE = 'pages/login/index'

App({
  onLaunch() {
    wx.cloud.init({ traceUser: false })
    loadSerifFont()
    // 断网恢复后自动刷新当前页（02 章第 5.2 节）
    watchNetwork(refreshCurrentPage)
  },
  // 停在登录页时先不连：登录页拿到 /me 再连（enter 里 start），不和首个请求抢冷启动中的后台。
  // 冷启动时页面还没建好，等一拍再看是哪一页（分享链接会直接进业务页）
  onShow() {
    setTimeout(() => {
      const pages = getCurrentPages()
      if (pages[pages.length - 1]?.route === LOGIN_ROUTE) return
      realtime.start()
    }, 0)
  },
  onHide() {
    realtime.stop()
  },
  // 旧版本地址（体验版路径、最近使用、旧分享）在新版不存在时回登录页重新分流
  onPageNotFound() {
    void wx.reLaunch({ url: '/pages/login/index' })
  },
})
