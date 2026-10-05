// 体验改版第 2 批「录入方式」的文案（02 章 hz-pick-sheet、06 章 X4、W5、S1）
export const entryCopy = {
  // 添加明细弹层
  picked: (n: number) => `已选 ${n} 种`,
  pickedAmount: (n: number, amount: string) => `已选 ${n} 种 · ${amount}`,
  searchMaterial: '搜索花材名称、编码',
  searchProduct: '搜索产品名称、客户产品编码',
  productSub: (code: string, price: string) => `客户产品编码 ${code} · 订货价 ${price}`,
  productPrice: (price: string) => `订货价 ${price}`,
  // 代客下单：客户、门店合成一次选择
  customerStore: '客户门店',
  pickStore: '选择门店',
  searchStore: '搜索客户、门店',
  linesCleared: '换了客户，已清空产品明细',
  // 门店订货：上一单、再来一单
  lastOrder: '上一单',
  reorder: '再来一单',
  lastOrderMeta: (date: string, lines: string) => `下单日期 ${date} · ${lines}`,
  lastOrderLine: (name: string, qty: number, unit: string) => `${name} ${qty}${unit}`,
  reordered: '已加进购物车',
  reorderSkipped: (names: string) => `${names}已停用，没加进购物车`,
  reorderAllSkipped: '上一单的产品都已停用',
  // 门店改单：核对修改
  reviewEdit: '核对修改',
  editPicked: (n: number, diff: string) => (diff ? `已选 ${n} 款 · ${diff}` : `已选 ${n} 款`),
  diffMore: (amount: string) => `比原单多 ${amount}`,
  diffLess: (amount: string) => `比原单少 ${amount}`,
  changedLines: '改动的产品',
  qtyChange: (from: number, to: number) => `${from} → ${to}`,
  noChange: '没有改动',
} as const
