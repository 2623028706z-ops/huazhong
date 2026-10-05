// 「有新结果要看」提醒的后台文案（2026-10-06 第 3 批，接口见 contract/notices.ts）
export const noticeCopy = {
  // 采购模块首页待办一行
  poDiffTodo: '到货有差异',
  // 采购单详情顶部提示条
  poDiffNotice: '到货和下单不一样',
  // 整单拒收时提示条头一行（后面接拒收原因）
  poRejectedAll: '整单拒收',
  // 打开后仓库又改价、退货了：先看最新的再点「知道了」
  poDiffStale: '到货差异有更新，请看最新内容后再点知道了',
  // 操作日志动作名
  poDiffAckLog: '确认到货差异',
} as const
