import { loadSerifFont } from './core/font'
import { realtime, refreshCurrentPage } from './core/live'
import { watchNetwork } from './core/network'

App({
  onLaunch() {
    wx.cloud.init({ traceUser: false })
    loadSerifFont()
    // 断网恢复后自动刷新当前页（02 章第 5.2 节）
    watchNetwork(refreshCurrentPage)
  },
  onShow() {
    realtime.start()
  },
  onHide() {
    realtime.stop()
  },
})
