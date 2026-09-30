// 界面文案：每句只在这里定义一次，前后端引用同一个键（00 章第 10 节）。
// 出处：02 章第 5 节（通用状态）、05 章（接口返回的句子）、06 章（各页文案）。

export const copy = {
  error: {
    unauthenticated: '没有绑定账号',
    accountDisabled: '账号已停用，请联系花众',
    storeDisabled: '这家门店已停用，请联系花众',
    supplierDisabled: '这家供应商已停用，请联系花众',
    forbidden: '没有权限查看这个页面',
    notFound: '没有找到这张单据',
    internal: '系统出错了，请稍后再试',
    validationFallback: '格式不对，请检查后重试',
  },
  network: {
    loadFailed: '网络不太好，没有加载出来',
    refreshFailed: '刷新失败，请重试',
    submitFailed: '网络不太好，没有提交成功，请重试',
  },
  // 操作日志、变更记录里的操作人快照（04 章第 3.3 节）
  actor: {
    system: '系统',
    external: (name: string, org: string) => `${name}（${org}）`,
  },
  org: {
    store: (customerName: string, storeName: string) => `${customerName} · ${storeName}`,
  },
  // 页面标题：思源宋体子集从这里抽字（scripts/gen-font）
  title: {
    devGallery: '组件总览',
  },
} as const
