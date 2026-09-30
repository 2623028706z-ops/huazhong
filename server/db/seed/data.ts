// 示例数据：07 章第 12 节是它的文字版。只用于开发和测试，上线不导入（01 章第 5 节）。
// 阶段 0 只有账号和账号外键要用的客户、门店、供应商；其余在各阶段补上。
import type { AccountType, ModuleKey } from '@huazhong/shared'

export const seedCustomers = [
  { key: 'c1', name: '晨曦花艺' },
  { key: 'c2', name: '拾光花店' },
  { key: 'c3', name: '一间花房' },
] as const

export const seedStores = [
  { key: 's1', customer: 'c1', name: '滨江店', enabled: true },
  { key: 's2', customer: 'c1', name: '城西店', enabled: true },
  { key: 's3', customer: 'c1', name: '城东店', enabled: false },
  { key: 's4', customer: 'c2', name: '文新店', enabled: true },
  { key: 's5', customer: 'c3', name: '湖滨店', enabled: true },
] as const

export const seedSuppliers = [
  { key: 'sp1', name: '春禾花材' },
  { key: 'sp2', name: '云岭花卉' },
  { key: 'sp3', name: '滇花源' },
] as const

// 07 章第 12.4 节：花材分类、花材、批次（阶段 2 为库存查询提前建）
export const seedMaterialCategories = [
  { key: 'rose', name: '玫瑰', sort: 1 },
  { key: 'main', name: '主花', sort: 2 },
  { key: 'filler', name: '配花', sort: 3 },
  { key: 'leaf', name: '叶材', sort: 4 },
] as const

type CategoryKey = (typeof seedMaterialCategories)[number]['key']

interface SeedMaterial {
  key: string
  code: string
  name: string
  category: CategoryKey
  unit: string
  // 入库日期、入库数量、剩余
  batches: readonly { inDate: string; qty: number; leftQty: number }[]
}

export const seedMaterials = [
  {
    key: 'w1',
    code: 'HC-0001',
    name: '粉雪山玫瑰',
    category: 'rose',
    unit: '枝',
    batches: [
      { inDate: '2026-09-26', qty: 28, leftQty: 28 },
      { inDate: '2026-09-28', qty: 200, leftQty: 200 },
    ],
  },
  {
    key: 'w2',
    code: 'HC-0002',
    name: '白玫瑰',
    category: 'rose',
    unit: '枝',
    batches: [{ inDate: '2026-09-28', qty: 146, leftQty: 146 }],
  },
  {
    key: 'w3',
    code: 'HC-0003',
    name: '向日葵',
    category: 'main',
    unit: '枝',
    batches: [{ inDate: '2026-09-27', qty: 70, leftQty: 60 }],
  },
  {
    key: 'w4',
    code: 'HC-0004',
    name: '洋桔梗',
    category: 'filler',
    unit: '枝',
    batches: [{ inDate: '2026-09-28', qty: 95, leftQty: 95 }],
  },
  {
    key: 'w5',
    code: 'HC-0005',
    name: '尤加利',
    category: 'leaf',
    unit: '枝',
    batches: [{ inDate: '2026-09-29', qty: 120, leftQty: 86 }],
  },
] as const satisfies readonly SeedMaterial[]

type StoreKey = (typeof seedStores)[number]['key']
type SupplierKey = (typeof seedSuppliers)[number]['key']

interface SeedAccount {
  key: string
  name: string
  type: AccountType
  phone: string
  modules?: readonly ModuleKey[]
  store?: StoreKey
  supplier?: SupplierKey
}

// 第一个是管理员，后面每个账号的 created_by 都是它
export const seedAccounts = [
  { key: 'u1', name: '周总', type: 'admin', phone: '13700000001' },
  { key: 'u2', name: '李敏', type: 'staff', phone: '13700000002', modules: ['sales'] },
  { key: 'u3', name: '王芳', type: 'staff', phone: '13700000003', modules: ['sales', 'warehouse'] },
  { key: 'u4', name: '周宁', type: 'staff', phone: '13700000004', modules: ['purchase'] },
  { key: 'u5', name: '陈青', type: 'staff', phone: '13700000005', modules: ['warehouse'] },
  { key: 'u6', name: '许静', type: 'staff', phone: '13700000006', modules: ['finance'] },
  { key: 'u7', name: '赵磊', type: 'staff', phone: '13700000007', modules: ['shipping'] },
  { key: 's1', name: '陈女士', type: 'store', phone: '13800138001', store: 's1' },
  { key: 'p1', name: '林先生', type: 'supplier', phone: '13900139001', supplier: 'sp1' },
  { key: 'p2', name: '杨女士', type: 'supplier', phone: '13900139002', supplier: 'sp2' },
] as const satisfies readonly SeedAccount[]

export type SeedAccountKey = (typeof seedAccounts)[number]['key']
