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
    filter: '筛选',
  },
  // 统一状态（02 章第 5 节）；state、confirm 里的句子用衬线字，也进字体子集
  state: {
    loading: '加载中',
    empty: (object: string) => `暂无${object}`,
    offline: '网络已断开，恢复后自动刷新',
    linkInvalid: '邀请已失效',
    allLoaded: '已显示全部',
  },
  confirm: {
    discardTitle: '放弃修改吗？',
    discardBody: '刚填的内容不会保存',
    keepEditing: '继续填写',
    discard: '放弃修改',
  },
  action: {
    retry: '重试',
    back: '返回',
    logout: '退出登录',
    submitting: '提交中',
    clear: '清除',
  },
  requestId: (id: string) => `请求编号 ${id}`,
  unit: { yuan: '元' },
  // 筛选栏（02 章第 4 节 hz-filter-bar）
  filter: {
    all: '全部',
    today: '今天',
    last7Days: '近 7 天',
    thisMonth: '本月',
    custom: '自定义',
    dateFrom: '开始日期',
    dateTo: '结束日期',
    range: (from: string, to: string) => `${from} 至 ${to}`,
    allOf: (object: string) => `全部${object}`,
    choose: (object: string) => `选择${object}`,
    search: (object: string) => `搜索${object}`,
  },
  // 记录列表标题（hz-records）
  records: {
    orderChange: '变更记录',
    poChange: '改单记录',
    priceChange: '改价记录',
    returns: '退货记录',
    reason: (text: string) => `原因：${text}`,
  },
  placeholder: {
    choose: '请选择',
    optional: '选填',
  },
} as const
