// 示例数据：07 章第 12.2–12.7 节的产品（按客户）、订货目录、订单、售后、收款、收付款方式。
// 单号按 DOC_NO_FORMAT（带年份）；日期是原型里的日期（原型：2026-09-29 是今天），接口测试把时钟拨到这一天
import type { AfterReason, OrderOrigin, OrderStatus } from '@huazhong/shared'
import type { SeedAccountKey } from './data.ts'

type MaterialKey = 'w1' | 'w2' | 'w3' | 'w4' | 'w5'

// 产品模板：每个客户目录里的产品按它建（产品归客户，2026-10-05 确认），目录项可以换配方
interface SeedProduct {
  key: string
  name: string
  unit: string
  bom: readonly { material: MaterialKey; qty: number }[]
}

export const seedProducts = [
  {
    key: 'p1',
    name: '粉玫瑰日常花束',
    unit: '束',
    bom: [
      { material: 'w1', qty: 10 },
      { material: 'w5', qty: 3 },
    ],
  },
  {
    key: 'p2',
    name: '白绿清新花束',
    unit: '束',
    bom: [{ material: 'w2', qty: 8 }],
  },
  {
    key: 'p3',
    name: '向日葵混合花束',
    unit: '束',
    bom: [{ material: 'w3', qty: 5 }],
  },
  {
    key: 'p4',
    name: '白绿桌花',
    unit: '盆',
    bom: [{ material: 'w4', qty: 6 }],
  },
] as const satisfies readonly SeedProduct[]

type ProductKey = (typeof seedProducts)[number]['key']
type CustomerKey = 'c1' | 'c2' | 'c3'
type StoreKey = 's1' | 's2' | 's3' | 's4' | 's5'

// 每个客户的订货分类（门店订货页按它分组）
export const seedCatalogCategories: readonly {
  key: string
  customer: CustomerKey
  name: string
  sort: number
}[] = [
  { key: 'c1-daily', customer: 'c1', name: '日常花束', sort: 1 },
  { key: 'c1-gift', customer: 'c1', name: '礼赠花束', sort: 2 },
  { key: 'c1-table', customer: 'c1', name: '桌面花艺', sort: 3 },
  { key: 'c2-daily', customer: 'c2', name: '日常花束', sort: 1 },
  { key: 'c3-gift', customer: 'c3', name: '礼赠花束', sort: 1 },
  { key: 'c3-table', customer: 'c3', name: '桌面花艺', sort: 2 },
]

// 每个客户自己的产品：价格按分；code 是客户产品编码（选填）；bom 不写就照产品模板
export const seedCatalog: readonly {
  customer: CustomerKey
  product: ProductKey
  category: string
  code: string
  price: number
  enabled: boolean
  bom?: readonly { material: MaterialKey; qty: number }[]
}[] = [
  {
    customer: 'c1',
    product: 'p1',
    category: 'c1-daily',
    code: 'CX-101',
    price: 6800,
    enabled: true,
  },
  {
    customer: 'c1',
    product: 'p2',
    category: 'c1-daily',
    code: 'CX-102',
    price: 7800,
    enabled: true,
  },
  { customer: 'c1', product: 'p3', category: 'c1-gift', code: '', price: 8800, enabled: false },
  {
    customer: 'c1',
    product: 'p4',
    category: 'c1-table',
    code: 'CX-301',
    price: 12800,
    enabled: true,
  },
  { customer: 'c2', product: 'p2', category: 'c2-daily', code: '', price: 7800, enabled: true },
  // 拾光花店的粉玫瑰日常花束配方和晨曦花艺不同（各管各的）
  {
    customer: 'c2',
    product: 'p1',
    category: 'c2-daily',
    code: '',
    price: 7000,
    enabled: true,
    bom: [
      { material: 'w1', qty: 12 },
      { material: 'w5', qty: 2 },
    ],
  },
  { customer: 'c3', product: 'p3', category: 'c3-gift', code: 'Y-01', price: 8800, enabled: true },
  {
    customer: 'c3',
    product: 'p4',
    category: 'c3-table',
    code: 'Y-02',
    price: 12800,
    enabled: true,
  },
]

export interface SeedOrderLine {
  product: ProductKey
  qty: number
  price: number
  listPrice: number
  shipped?: number
}

interface SeedOrder {
  no: string
  orderDate: string
  shipDate: string | null
  customer: CustomerKey
  store: StoreKey
  status: OrderStatus
  origin: OrderOrigin
  createdBy: SeedAccountKey
  note: string
  // 已发货的：发货人赵磊、发货时间（UTC）、发货备注
  shippedAt?: string
  shipNote?: string
  lines: readonly SeedOrderLine[]
}

export const seedOrders: readonly SeedOrder[] = [
  {
    no: 'SO-260929-018',
    orderDate: '2026-09-29',
    shipDate: null,
    customer: 'c1',
    store: 's1',
    status: 'pending_confirm',
    origin: 'store',
    createdBy: 's1',
    note: '上午送达，独立包装。',
    lines: [
      { product: 'p1', qty: 20, price: 6800, listPrice: 6800 },
      { product: 'p2', qty: 10, price: 7800, listPrice: 7800 },
    ],
  },
  {
    no: 'SO-260929-016',
    orderDate: '2026-09-29',
    shipDate: '2026-09-29',
    customer: 'c2',
    store: 's4',
    status: 'to_ship',
    origin: 'sales',
    createdBy: 'u2',
    note: '',
    lines: [{ product: 'p2', qty: 20, price: 7800, listPrice: 7800 }],
  },
  {
    no: 'SO-260928-012',
    orderDate: '2026-09-28',
    shipDate: '2026-09-29',
    customer: 'c3',
    store: 's5',
    status: 'to_ship',
    origin: 'sales',
    createdBy: 'u2',
    note: '门店自提',
    lines: [{ product: 'p3', qty: 15, price: 8000, listPrice: 8800 }],
  },
  {
    no: 'SO-260927-026',
    orderDate: '2026-09-27',
    shipDate: '2026-09-28',
    customer: 'c1',
    store: 's2',
    status: 'shipped',
    origin: 'sales',
    createdBy: 'u2',
    note: '',
    shippedAt: '2026-09-27T23:40:00.000Z',
    lines: [
      { product: 'p1', qty: 24, price: 6800, listPrice: 6800, shipped: 24 },
      { product: 'p2', qty: 6, price: 7800, listPrice: 7800, shipped: 6 },
    ],
  },
  {
    no: 'SO-260928-030',
    orderDate: '2026-09-28',
    shipDate: '2026-09-29',
    customer: 'c2',
    store: 's4',
    status: 'shipped',
    origin: 'store',
    createdBy: 'u2',
    note: '',
    shippedAt: '2026-09-28T23:15:00.000Z',
    lines: [{ product: 'p2', qty: 12, price: 7800, listPrice: 7800, shipped: 12 }],
  },
  {
    no: 'SO-260927-021',
    orderDate: '2026-09-27',
    shipDate: '2026-09-28',
    customer: 'c1',
    store: 's1',
    status: 'shipped',
    origin: 'store',
    createdBy: 's1',
    note: '',
    shippedAt: '2026-09-27T23:30:00.000Z',
    shipNote: '白绿清新花束缺货，少发 2 束',
    lines: [
      { product: 'p1', qty: 15, price: 6800, listPrice: 6800, shipped: 15 },
      { product: 'p2', qty: 8, price: 7800, listPrice: 7800, shipped: 6 },
    ],
  },
]

// 发货人（07 章第 12.5 节）、登记收款的财务
export const seedShipper: SeedAccountKey = 'u7'
export const seedCashier: SeedAccountKey = 'u6'

export const seedAfters: readonly {
  no: string
  afterDate: string
  order: string
  createdBy: SeedAccountKey
  lines: readonly { product: ProductKey; qty: number; reason: AfterReason; description: string }[]
}[] = [
  {
    no: 'AS-260929-003',
    afterDate: '2026-09-29',
    order: 'SO-260927-026',
    // 城西店没有门店账号，示例数据记在管理员名下
    createdBy: 'u1',
    lines: [{ product: 'p1', qty: 2, reason: 'damaged', description: '两束花头折损' }],
  },
]

export const seedStatementRows = [
  {
    no: 'DZ-260929-001',
    customer: 'c1' as const,
    orders: ['SO-260927-021', 'SO-260927-026'],
    settled: false,
  },
  { no: 'DZ-260929-002', customer: 'c2' as const, orders: ['SO-260928-030'], settled: true },
] as const
export const seedReceipts = [
  {
    no: 'SK-260929-001',
    receiptDate: '2026-09-29',
    createdAt: '2026-09-29T01:10:00.000Z',
    customer: 'c2' as const,
    amount: 100000,
    method: '微信',
    note: '',
    creditCents: 6400,
    statements: ['DZ-260929-002'],
  },
] as const

// 收付款方式共用一份，都启用
export const seedMethodNames = ['转账', '微信', '支付宝', '现金'] as const
