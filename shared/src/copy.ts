// 界面文案：每句只在这里定义一次，前后端引用同一个键（00 章第 10 节）。
// 出处：02 章第 5 节（通用状态）、05 章（接口返回的句子）、06 章（各页文案）。

// 同一行里并列的几项之间（身份行、卡片第 3 行）
const SEPARATOR = ' · '

export const copy = {
  separator: SEPARATOR,
  error: {
    unauthenticated: '没有绑定账号',
    accountDisabled: '账号已停用，请联系花众',
    storeDisabled: '这家门店已停用，请联系花众',
    supplierDisabled: '这家供应商已停用，请联系花众',
    forbidden: '没有权限查看这个页面',
    notFound: '没有找到这张单据',
    internal: '系统出错了，请稍后再试',
    validationFallback: '格式不对，请检查后重试',
    dateRange: '结束日期不能早于开始日期',
    noChange: '没有修改内容',
  },
  // 登录绑定（05 章第 2 节）
  auth: {
    phoneNotRegistered: '这个手机号还没开通，请联系花众管理员',
    boundToOtherWechat: '这个账号已绑定其他微信，请联系管理员解绑',
    phoneCodeInvalid: '手机号验证失败，请重试',
    loginButton: '手机号快速验证登录',
    privacyPrefix: '我已阅读并同意',
    privacyContract: '《花众小程序隐私保护指引》',
    privacyRequired: '请先阅读并同意隐私保护指引',
  },
  // 员工与岗位（05 章第 3 节、06 章 M7）
  staff: {
    nameRequired: '请填写名字',
    phoneInvalid: '请填写 11 位登录手机号',
    phoneTaken: '这个手机号已经被其他账号使用',
    modulesRequired: '请至少选一个模块',
    lastAdmin: '至少要保留一个启用的管理员',
    stale: '这个员工刚被修改，已刷新成最新内容',
    notBound: '这个员工还没绑定微信',
    unbindTogether: '同时解绑微信',
    roleSeparator: '、',
  },
  // 账号类操作日志（05 章第 2 节）：module 为空 = 公共
  log: {
    kindAccount: '账号',
    bind: '绑定微信',
    unbind: '解绑微信',
    createStaff: '新增员工',
    updateStaff: '修改员工',
    publicModule: '公共',
    reason: '原因',
    before: '修改前',
    after: '修改后',
    changes: '改动',
    // 改动「旧 → 新」里旧值后面接的箭头
    arrow: ' → ',
    date: '操作日期',
  },
  // 账号字段名：员工弹层、个人资料、日志的修改前后共用
  field: {
    name: '名字',
    phone: '登录手机号',
    role: '岗位',
    status: '状态',
    admin: '管理员',
    modules: '模块',
    org: '所属',
    wechat: '微信',
  },
  statusValue: {
    enabled: '启用',
    disabled: '停用',
    bound: '已绑定',
  },
  store: {
    customerDisabled: '这个客户已停用，不能再下新单，请联系花众',
  },
  // 底栏（02 章第 4 节 hz-tabbar）
  tab: {
    home: '首页',
    my: '我的',
  },
  // 门店首页、供应商首页的主卡和小卡（03 章第 8.5 节）
  hub: {
    order: '订货',
    orders: '订单',
    afters: '售后',
    statement: '对账',
    supply: '填报',
    purchaseOrders: '采购单',
  },
  // 列表的对象名：空状态「暂无 + 对象」、搜索框、筛选项
  object: {
    inventory: '符合条件的库存',
    logs: '操作日志',
    staff: '员工',
    material: '花材',
    category: '分类',
    module: '模块',
  },
  tag: {
    disabled: '已停用',
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
    store: (customerName: string, storeName: string) => `${customerName}${SEPARATOR}${storeName}`,
  },
  // 页面标题：思源宋体子集从这里抽字（scripts/gen-font）
  title: {
    devGallery: '组件总览',
    filter: '筛选',
    my: '我的',
    inventory: '库存查询',
    logs: '操作日志',
    logDetail: '日志详情',
    staff: '员工与岗位',
    staffCreate: '新增员工',
    staffEdit: '编辑员工',
    profile: '个人资料',
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
    logoutTitle: '退出登录吗？',
    logoutBody: '下次进入要重新用手机号验证',
    unbindTitle: '解绑微信吗？',
    unbindBody: '对方下次打开要重新用手机号验证',
    cancel: '取消',
  },
  action: {
    retry: '重试',
    back: '返回',
    logout: '退出登录',
    submitting: '提交中',
    clear: '清除',
    save: '保存',
    saved: '已保存',
    unbound: '已解绑',
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
