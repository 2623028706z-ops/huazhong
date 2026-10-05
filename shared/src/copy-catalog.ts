// 订货目录、目录产品、从其他客户复制的页面文案（06 章 X11、X13、X14）：并进 copy.screen
export const catalogScreen = {
  bomCount: (count: number) => `配方 ${count} 种花材`,
  needCategory: '请先新增订货分类',
  // 订货目录（2026-10-05 产品归客户）
  catalog: {
    owner: (customer: string) => `${customer}的产品`,
    productName: '产品名称',
    bomHint: (unit: string, count: number) => `每${unit}用量 · ${count} 种花材`,
    createHint: '从空白开始填名称、配方、订货价',
    copyHint: '带名称、单位、产品图、配方、订货价；客户产品编码不带',
    skipDuplicate: '这个客户已有同名产品，跳过',
    skipDisabled: '已停用，跳过',
    copyCount: (count: number) => `复制（${count}）`,
    copyChanged: '来源或当前目录刚被修改，已刷新，请重新勾选',
    noSources: '可复制的客户',
    bomLink: '配方',
    shippedHint: '发货时存下，之后改配方不影响',
    productCount: (count: number) => `${count} 个产品`,
  },
  // 目录行的订货价「¥68.00/束」、弹层里订货价的标签「订货价（元/束）」
  pricePer: (price: string, unit: string) => `${price}/${unit}`,
  // 目录行、商品卡上的订货价带字段名：「订货价 ¥68.00/束」
  listPriceText: (price: string, unit: string) => `订货价 ${price}/${unit}`,
  priceLabel: (unit: string) => `订货价（元/${unit}）`,
} as const
