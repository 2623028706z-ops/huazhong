// 2026-10-06 体验改版第 3、4 批（流程接续、页面模板）的界面文案：按模块分段
export const flowCopy = {
  common: {
    // 底栏「更多」（02 章第 4 节 hz-action-bar）
    more: '更多',
    moreTitle: '更多操作',
    // 列表卡大字、小字里的日期（02 章第 6 节第 18 条）：「出货 09-28 周日」
    shipOn: (date: string) => `出货 ${date}`,
    shipDateTbd: '出货日期待定',
    orderedOn: (date: string) => `下单 ${date}`,
    invitedOn: (date: string) => `邀请 ${date}`,
  },
  ship: {
    // 发货卡右上：出货日期过了标红
    shipPast: (text: string) => `${text} 已过`,
    // 单张发货成功后留在本页（06 章 H3）：底栏「返回列表 / 送货单」
    backToList: '返回列表',
    // 批量发货结果弹层（06 章 H2）：头行、失败行原因、行右侧入口
    resultTitle: '发货结果',
    resultHead: (shipped: number, failed: number) =>
      failed ? `已发货 ${shipped} 单，${failed} 单没发出` : `已发货 ${shipped} 单`,
    notShipped: (reason: string) => `没发出：${reason}`,
    deliveryLink: '送货单 ›',
    viewLink: '查看 ›',
  },
  purchase: {
    // 采购单列表筛选弹层里的一项（待办「到货有差异」点进来已选好）
    diffFilter: '到货有差异',
    // 采购单详情到货差异提示条（06 章 C4）：一种花材一行，只写有差异的项
    diffReceived: (received: number, unit: string, qty: number) =>
      `实收 ${received} ${unit}（下单 ${qty}）`,
    diffPrice: (from: string, to: string) => `单价 ${from} → ${to}`,
    diffReturned: (qty: number, unit: string) => `退货 ${qty} ${unit}`,
    diffVoided: '收货后被仓库作废',
    diffReason: (head: string, reason: string) => `${head}：${reason}`,
    // 供应商列表搜索框（2026-10-06 补充决定：搜名称、联系人）
    supplierSearch: '搜索供应商名称、联系人',
  },
  store: {
    // S3 订单段搜索框（2026-10-06 第 4 批）、S12 选订单的搜索框
    orderSearch: '搜索单号、产品',
    // S12 选订单页顶上一句
    pickHint: '只列能申请售后的已发货订单',
  },
  finance: {
    // 往来卡（06 章 F1、F8）：有逾期的标签、没有往来的小字
    overdueTag: '逾期',
    noActivity: '还没有往来',
    // 小字里「对账截止 09-29 周二」「未对账 ¥120.00」这类：名称 + 值
    labelled: (label: string, value: string) => `${label} ${value}`,
  },
  warehouse: {
    // 仓库首页点「盘点」直接弹的分类层（06 章 W1、W8，2026-10-06 第 3 批）
    allCategories: '全部分类',
    categoryCount: (count: number) => `${count} 种花材`,
    stocktakeRecordsLink: '盘点记录 ›',
  },
} as const
