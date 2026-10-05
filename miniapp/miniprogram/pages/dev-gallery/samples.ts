// 组件总览的示例数据：只在开发环境的组件总览页用，和 db/seed 一样允许写中文和数字
import type { FilterDimension } from '../../core/filter'

const GALLERY_URL = '/pages/dev-gallery/index'

const identity = { roles: '销售、仓库', person: '王芳' }

const storeTabs = [
  { key: 'shop', icon: 'flower-2', text: '订货', url: GALLERY_URL, badge: 0 },
  { key: 'orders', icon: 'file-text', text: '订单', url: GALLERY_URL, badge: 3 },
  { key: 'my', icon: 'user-round', text: '我的', url: GALLERY_URL, badge: 0 },
]

const supplierTabs = [
  { key: 'orders', icon: 'file-text', text: '采购单', url: GALLERY_URL, badge: 0 },
  { key: 'supply', icon: 'clipboard-list', text: '填报', url: GALLERY_URL, badge: 120 },
  { key: 'my', icon: 'user-round', text: '我的', url: GALLERY_URL, badge: 0 },
]

const coverModes = [
  { key: '', text: '不铺' },
  { key: 'full', text: '整屏' },
  { key: 'soft', text: '淡化' },
  { key: 'login', text: '登录页' },
]

const entries = [
  { key: 'sales', icon: 'receipt', text: '销售', disabled: false },
  { key: 'purchase', icon: 'flower-2', text: '采购', disabled: false },
  { key: 'order', icon: 'shopping-bag', text: '订货', disabled: true },
  { key: 'warehouse', icon: 'boxes', text: '仓库', disabled: false },
  { key: 'shipping', icon: 'truck', text: '发货', disabled: false },
]

// 模块首页的小一号入口（仓库首页的入口数，图标先借现有的）
const moduleEntries = [
  { key: 'recv', icon: 'truck', text: '待收货', disabled: false },
  { key: 'in', icon: 'plus', text: '手工入库', disabled: false },
  { key: 'out', icon: 'minus', text: '手工出库', disabled: false },
  { key: 'loss', icon: 'trash-2', text: '报损', disabled: false },
  { key: 'check', icon: 'clipboard-list', text: '盘点', disabled: false },
  { key: 'stock', icon: 'boxes', text: '库存', disabled: false },
  { key: 'material', icon: 'flower-2', text: '花材', disabled: true },
]

// 库存列表：没有金额，总数是关键数字；库存 0 照常次要色
const stockCards = [
  { id: 's1', title: '粉雪山玫瑰', total: '228 枝', key: true, meta: 'HC-0001 · 玫瑰', tags: [] },
  {
    id: 's2',
    title: '洋桔梗',
    total: '0 枝',
    key: false,
    meta: 'HC-0007 · 配花',
    tags: [{ text: '已停用', warn: false }],
  },
]

const cards = [
  {
    id: '1',
    date: '2026-09-30',
    status: 'pending_confirm',
    title: '静安花艺工作室 · 静安店',
    total: '共 32 束',
    meta: 'SO-260930-012',
    amount: 386000,
    tags: [],
  },
  {
    id: '2',
    date: '2026-09-29',
    status: 'shipped',
    title: '云间花事 · 徐汇店',
    total: '共 58 束',
    meta: 'SO-260929-038',
    amount: 651250,
    tags: [
      { text: '改价', warn: true },
      { text: '改单', warn: false },
    ],
  },
  {
    id: '3',
    date: '2025-12-28',
    status: 'cancelled',
    title: '花与器 FLORA',
    total: '共 12 束',
    meta: 'SO-251228-004',
    amount: 230500,
    tags: [],
  },
]

const statusRows = [
  [
    ['orderStatus', 'pending_confirm'],
    ['orderStatus', 'to_ship'],
    ['payStatus', 'partial'],
    ['inviteStatus', 'pending'],
  ],
  [
    ['orderStatus', 'shipped'],
    ['payStatus', 'paid'],
    ['whDocStatus', 'stocked_in'],
    ['apStatus', 'paid'],
  ],
  [
    ['orderStatus', 'cancelled'],
    ['recordStatus', 'voided'],
    ['storeInviteStatus', 'expired'],
    ['apStatus', 'no_pay'],
  ],
]

const tags = [
  { text: '改单', warn: false },
  { text: '售后抵扣', warn: false },
  { text: '改价', warn: true },
  { text: '少发', warn: true },
  { text: '已停用', warn: true },
]

const texts = {
  cancelOrder: '取消订单',
  confirmOrder: '确认订单',
  edit: '修改',
  newSale: '新建销售单',
  storeDisabled: '这家门店已停用，不能确认订单',
  viewAll: '查看全部',
  confirmed: '订单已确认',
  longToast: '已保存，库存会在几秒内刷新',
  openSheet: '打开弹层',
  askConfirm: '问一下确认框',
  showError: '显示报错',
  customer: '客户',
  customerValue: '晨曦花艺',
  qty: '数量',
  qtyError: '数量须大于 0',
  note: '备注',
  optional: '选填',
  store: '门店',
  storeHolder: '请选择门店',
  shipDate: '出货日期',
  dateFrom: '出货日期起',
  dateTo: '止',
  searchHolder: '搜索单号、客户、门店',
  orderDate: '下单日期',
  moveDate: '日期',
  addProduct: '添加产品',
  sheetTitle: '售后详情',
  closeAfter: '关闭售后',
  handleAfter: '处理售后',
  navTitle: '销售订单',
  pageTitle: '组件总览',
  emptyObject: '订单',
  retryMessage: '刷新失败，请重试',
  businessError: '这张订单已发货，不能再修改',
}

const stores = [
  { id: 's1', name: '静安店' },
  { id: 's2', name: '徐汇店' },
]

const orderStatuses = ['pending_confirm', 'to_ship', 'shipped', 'cancelled']
const countsA = { pending_confirm: 2, to_ship: 3 }
const countsB = { pending_confirm: 128, to_ship: 2 }

const customers: FilterDimension = {
  key: 'customerId',
  label: '客户',
  options: [
    { id: 'c1', name: '静安花艺工作室' },
    { id: 'c2', name: '云间花事' },
    { id: 'c3', name: '花与器 FLORA' },
  ],
}

const categories: FilterDimension = {
  key: 'categoryId',
  label: '分类',
  options: [
    { id: 'k1', name: '成品花' },
    { id: 'k2', name: '鲜切花' },
  ],
}

const editLines = [
  {
    key: 'p1',
    name: '粉玫瑰花束',
    tags: [{ text: '改价 ¥68 → ¥64', warn: true }],
    amountCents: 128000,
    qty: 20,
    unit: '束',
    priceCents: 6400,
    priceText: '64.00',
  },
  {
    key: 'p2',
    name: '白绿清新',
    tags: [],
    amountCents: 96000,
    qty: 12,
    unit: '束',
    priceCents: 8000,
    priceText: '80.00',
  },
]

const extraLine = {
  key: 'p3',
  name: '香槟雪山',
  tags: [],
  amountCents: 7200,
  qty: 1,
  unit: '束',
  priceCents: 7200,
  priceText: '72.00',
}

const viewLines = [
  { ...editLines[0], tags: [{ text: '改价', warn: true }] },
  {
    key: 'p2',
    name: '白绿清新',
    tags: [{ text: '少发', warn: true }],
    amountCents: 88000,
    qty: 11,
    unit: '束',
    priceCents: 8000,
    priceText: '80.00',
  },
]

const sheetRows = [
  { label: '产品', value: '粉玫瑰花束 × 4' },
  { label: '问题原因', value: '花头折损' },
  { label: '售后金额', value: '¥272.00' },
]

const notices = {
  locked: '已付款，不能再退货或改单价',
  disabled: '这个客户已停用，不能再下新单，请联系花众',
  realtime: '销售修改了这张订单，已刷新成最新内容',
}

const records = [
  {
    id: 'r1',
    at: '2026-09-30T02:24:00.000Z',
    actor: '李敏',
    changes: ['粉玫瑰花束 20 → 25', '出货日期 10-01 → 10-02'],
    reason: '门店追加',
  },
  {
    id: 'r2',
    at: '2026-09-30T01:10:00.000Z',
    actor: '陈女士',
    changes: ['提交订单'],
    reason: null,
  },
]

const statement = [
  { label: '发货金额', amountCents: 1842000, due: false },
  { label: '售后', amountCents: -27200, due: false },
  { label: '已付', amountCents: 1200000, due: false },
  { label: '未付', amountCents: 614800, due: true },
]

// TDesign 按 url 做列表 key，示例只放一张（主包里只有这一张图）
const uploadFiles = [{ url: '/assets/backdrop.jpg' }]

// styles/tokens.wxss 里的颜色变量名（去掉 --hz- 前缀）
const swatches = [
  'brand',
  'ink',
  'muted',
  'paper',
  'card',
  'bg',
  'hair',
  'line',
  'tint',
  'green',
  'green-bg',
  'amber',
  'amber-bg',
  'grey',
  'grey-bg',
  'danger',
  'danger-bg',
  'rule',
]

// 一个对象导出：组件总览页整个铺进 data
export const samples = {
  identity,
  storeTabs,
  supplierTabs,
  coverModes,
  entries,
  moduleEntries,
  stockCards,
  cards,
  statusRows,
  tags,
  texts,
  stores,
  orderStatuses,
  countsA,
  countsB,
  customers,
  categories,
  editLines,
  extraLine,
  viewLines,
  sheetRows,
  notices,
  records,
  statement,
  uploadFiles,
  swatches,
}
