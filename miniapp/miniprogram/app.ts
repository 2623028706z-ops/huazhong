import { loadSerifFont } from './core/font'
import { watchNetwork } from './core/network'
import { Realtime, type AuthFailure } from './core/realtime'

// 重连后当前页整页刷新一次：各页的刷新都放在 onShow 里（01 章第 3.3 节）
function refreshCurrentPage(): void {
  const page = getCurrentPages().at(-1)
  const onShow: (() => unknown) | undefined = page?.onShow
  void onShow?.call(page)
}

// 登录页和停用页在阶段 2 做，先记日志
function reportAuthFailure(code: AuthFailure): void {
  wx.getRealtimeLogManager().warn('realtime auth failure', code)
}

const realtime = new Realtime({ onResync: refreshCurrentPage, onAuthFailure: reportAuthFailure })

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
