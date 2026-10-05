// 操作成功（02 章第 5.4 节）：写结果；带图标最多 7 个字，更长的不带图标
import { TOAST_DURATION_MS } from '@huazhong/shared'

const ICON_TITLE_MAX = 7

export function showSuccess(title: string): void {
  void wx.showToast({
    title,
    icon: title.length <= ICON_TITLE_MAX ? 'success' : 'none',
    duration: TOAST_DURATION_MS,
  })
}

// 提示一句话（不带图标）：例如换客户清空了明细、再来一单跳过了停用产品
export function showNotice(title: string): void {
  void wx.showToast({ title, icon: 'none', duration: TOAST_DURATION_MS })
}
