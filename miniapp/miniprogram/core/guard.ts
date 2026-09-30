// 放弃修改（02 章第 5.4 节）：只从这里走（00 章第 6 节）。
// 页面内返回、弹层关闭用花众确认框；右滑返回和安卓返回键用 wx.enableAlertBeforeUnload（01 章第 3.1 节）。
import { copy } from '@huazhong/shared'

// 改回原值不算修改：按内容比较，不按「动过没有」
export function isChanged(initial: unknown, current: unknown): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current)
}

// 右滑返回、安卓返回键：改过内容时由微信弹系统确认框
export function syncUnloadAlert(changed: boolean): void {
  if (changed) wx.enableAlertBeforeUnload({ message: copy.confirm.discardTitle })
  else wx.disableAlertBeforeUnload()
}

interface ConfirmHost {
  selectComponent: (selector: string) => unknown
}

// hz-confirm 的 ask()：标题 + 一句说明 + 两个按钮
export interface AskOptions {
  title: string
  body: string
  cancel: string
  confirm: string
}

interface ConfirmComponent {
  ask: (options: AskOptions) => Promise<boolean>
}

// 页面上放一个 <hz-confirm id="hz-confirm" />，放弃修改和其他确认都用它
const CONFIRM_SELECTOR = '#hz-confirm'

function confirmOf(host: ConfirmHost): ConfirmComponent {
  const found = host.selectComponent(CONFIRM_SELECTOR) as ConfirmComponent | null
  if (!found) throw new Error(`Page has no ${CONFIRM_SELECTOR}`)
  return found
}

// 改过内容就问一次，返回能不能离开
export function confirmLeave(host: ConfirmHost, changed: boolean): Promise<boolean> {
  if (!changed) return Promise.resolve(true)
  return confirmOf(host).ask({
    title: copy.confirm.discardTitle,
    body: copy.confirm.discardBody,
    cancel: copy.confirm.keepEditing,
    confirm: copy.confirm.discard,
  })
}
