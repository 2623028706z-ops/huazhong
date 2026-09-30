// 断网提示（02 章第 5.2 节）：顶栏下出一条提示，内容保留；恢复后自动刷新当前页并收起提示。
type Listener = (online: boolean) => void

const listeners = new Set<Listener>()
let online = true

// app.onLaunch 调一次；onRestore 在「断过又恢复」时调用
export function watchNetwork(onRestore: () => void): void {
  wx.getNetworkType({
    success: ({ networkType }) => {
      online = networkType !== 'none'
      listeners.forEach((listener) => {
        listener(online)
      })
    },
  })
  wx.onNetworkStatusChange(({ isConnected }) => {
    const restored = !online && isConnected
    online = isConnected
    listeners.forEach((listener) => {
      listener(online)
    })
    if (restored) onRestore()
  })
}

// 顶栏订阅：立即告诉一次当前状态，返回退订函数
export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener)
  listener(online)
  return () => {
    listeners.delete(listener)
  }
}
