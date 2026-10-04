// 配货勾选只留在这台手机；键使用订单明细id，不把它当作单据状态。
const keyOf = (id: string) => `hz:picking:${id}`
export function loadPicking(id: string): string[] {
  const value: unknown = wx.getStorageSync(keyOf(id))
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
export function savePicking(id: string, ids: readonly string[]): void {
  wx.setStorageSync(keyOf(id), [...ids])
}
export function clearPicking(id: string): void {
  wx.removeStorageSync(keyOf(id))
}
