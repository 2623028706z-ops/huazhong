// 全小程序共用一条实时连接（05 章第 12 节）；页面按 onShow 订阅、onHide / onUnload 退订
import type { Topic } from '@huazhong/shared'
import { Realtime } from './realtime'

const LOGIN_ROUTE = 'pages/login/index'

// 重连后、断网恢复后当前页整页刷新一次：各页的刷新都放在 onShow 里（01 章第 3.3 节）
export function refreshCurrentPage(): void {
  const page = getCurrentPages().at(-1)
  const onShow: (() => unknown) | undefined = page?.onShow
  void onShow?.call(page)
}

// 解绑、停用：回登录页，登录页再按 /me 的结果显示登录区或停用状态
function returnToLogin(): void {
  if (getCurrentPages().at(-1)?.route === LOGIN_ROUTE) return
  void wx.reLaunch({ url: `/${LOGIN_ROUTE}` })
}

export const realtime = new Realtime({ onResync: refreshCurrentPage, onAuthFailure: returnToLogin })

const watchers = new WeakMap<object, (() => void)[]>()

// 页面 onShow 时调：先退掉上一次的订阅，再订这次的
export function watch(page: object, topics: Topic[], onChange: () => void): void {
  unwatch(page)
  watchers.set(
    page,
    topics.map((topic) => realtime.subscribe(topic, onChange)),
  )
}

export function unwatch(page: object): void {
  for (const stop of watchers.get(page) ?? []) stop()
  watchers.delete(page)
}
