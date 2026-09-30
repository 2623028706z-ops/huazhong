// 公共层和实时推送的纯函数
import { moduleKeys } from '@huazhong/shared'
import { describe, expect, test } from 'vitest'
import { decodeCursor, encodeCursor, pageOf } from '../../src/common/domain/cursor.ts'
import { formatDocNo } from '../../src/common/domain/doc-no.ts'
import {
  actorLabelOf,
  isGranted,
  resolveViewer,
  type AccountRow,
  type Viewer,
} from '../../src/common/domain/viewer.ts'
import { canDeliver, canSubscribe, covers } from '../../src/realtime/domain/access.ts'
import { isIdle } from '../../src/realtime/domain/idle.ts'

const staff = (modules: Viewer['modules']): Viewer => ({
  accountId: 2,
  type: 'staff',
  name: '李敏',
  modules,
  storeId: null,
  customerId: null,
  supplierId: null,
  orgLabel: null,
})
const admin: Viewer = { ...staff(moduleKeys), accountId: 1, type: 'admin', name: '周总' }
const store: Viewer = {
  ...staff([]),
  accountId: 8,
  type: 'store',
  name: '陈女士',
  storeId: 11,
  customerId: 3,
  orgLabel: '晨曦花艺 · 滨江店',
}
const supplier: Viewer = {
  ...staff([]),
  accountId: 9,
  type: 'supplier',
  name: '林先生',
  supplierId: 21,
  orgLabel: '春禾花材',
}
const noScope = { storeIds: [], supplierIds: [] }

describe('身份', () => {
  const row: AccountRow = {
    accountId: 2,
    type: 'staff',
    name: '李敏',
    enabled: true,
    modules: ['finance', 'sales'],
    storeId: null,
    storeName: null,
    storeEnabled: null,
    customerId: null,
    customerName: null,
    supplierId: null,
    supplierName: null,
    supplierEnabled: null,
  }

  test('员工的模块按固定顺序排列', () => {
    expect(resolveViewer(row).modules).toEqual(['sales', 'finance'])
  })

  test('查不到账号 → UNAUTHENTICATED；停用 → ACCOUNT_DISABLED', () => {
    expect(() => resolveViewer(undefined)).toThrow('没有绑定账号')
    expect(() => resolveViewer({ ...row, enabled: false })).toThrow('账号已停用')
  })

  test('角色判断：模块码、staff、admin、store、supplier', () => {
    expect(isGranted(staff(['sales']), ['sales'])).toBe(true)
    expect(isGranted(staff(['shipping']), ['sales'])).toBe(false)
    expect(isGranted(admin, ['finance'])).toBe(true)
    expect(isGranted(admin, ['admin'])).toBe(true)
    expect(isGranted(staff(['sales']), ['admin'])).toBe(false)
    expect(isGranted(staff([]), ['staff'])).toBe(true)
    expect(isGranted(store, ['staff'])).toBe(false)
    expect(isGranted(store, ['store'])).toBe(true)
    expect(isGranted(supplier, ['supplier'])).toBe(true)
    expect(isGranted(supplier, 'any')).toBe(true)
  })

  test('操作人快照：系统、员工、门店和供应商带归属', () => {
    expect(actorLabelOf(null)).toBe('系统')
    expect(actorLabelOf(admin)).toBe('周总')
    expect(actorLabelOf(store)).toBe('陈女士（晨曦花艺 · 滨江店）')
    expect(actorLabelOf(supplier)).toBe('林先生（春禾花材）')
  })
})

describe('单号和游标', () => {
  test('单号：前缀-YYMMDD-至少三位序号', () => {
    expect(formatDocNo('SO', '2026-09-30', 1)).toBe('SO-260930-001')
    expect(formatDocNo('PO', '2026-10-01', 999)).toBe('PO-261001-999')
    expect(formatDocNo('SK', '2027-01-02', 1000)).toBe('SK-270102-1000')
  })

  test('游标编码后能原样解出；乱写的游标 → VALIDATION_FAILED', () => {
    const cursor = encodeCursor(['2026-09-30T02:00:00.000Z', 42])
    expect(decodeCursor(cursor)).toEqual(['2026-09-30T02:00:00.000Z', 42])
    expect(() => decodeCursor('garbage')).toThrow()
  })

  test('多取一条判断下一页', () => {
    const cursorOf = (n: number) => [n, n] as [number, number]
    expect(pageOf([3, 2, 1], 2, cursorOf)).toEqual({
      items: [3, 2],
      nextCursor: encodeCursor([2, 2]),
    })
    expect(pageOf([3, 2], 2, cursorOf)).toEqual({ items: [3, 2], nextCursor: null })
  })
})

describe('实时推送权限', () => {
  test('员工按模块订阅；库存查询所有员工都能订阅', () => {
    expect(canSubscribe(staff(['shipping']), 'orders')).toBe(true)
    expect(canSubscribe(staff(['purchase']), 'orders')).toBe(false)
    expect(canSubscribe(staff(['purchase']), 'stock')).toBe(true)
    expect(canSubscribe(staff(['sales']), 'todo:sales')).toBe(true)
    expect(canSubscribe(staff(['sales']), 'todo:finance')).toBe(false)
    expect(canSubscribe(staff(['sales']), 'todo:*')).toBe(true)
    expect(canSubscribe(staff(['finance']), 'ar:*')).toBe(true)
    expect(canSubscribe(staff(['finance']), 'supplier:21')).toBe(false)
  })

  test('只有本人能订阅 account 主题', () => {
    expect(canSubscribe(store, 'account:8')).toBe(true)
    expect(canSubscribe(store, 'account:1')).toBe(false)
  })

  test('门店只能订阅本客户的对账和目录，推送只收本店的', () => {
    expect(canSubscribe(store, 'ar:3')).toBe(true)
    expect(canSubscribe(store, 'ar:4')).toBe(false)
    expect(canSubscribe(store, 'ar:*')).toBe(false)
    expect(canSubscribe(store, 'pos')).toBe(false)
    expect(canDeliver(store, 'order:5', { storeIds: ['11'], supplierIds: [] })).toBe(true)
    expect(canDeliver(store, 'order:5', { storeIds: ['12'], supplierIds: [] })).toBe(false)
    expect(canDeliver(store, 'ar:3', { storeIds: ['12'], supplierIds: [] })).toBe(false)
    expect(canDeliver(store, 'catalog:3', noScope)).toBe(true)
  })

  test('供应商只收本家的采购单和邀请，只能订阅本家的对账', () => {
    expect(canSubscribe(supplier, 'ap:21')).toBe(true)
    expect(canSubscribe(supplier, 'supplier:22')).toBe(false)
    expect(canSubscribe(supplier, 'orders')).toBe(false)
    expect(canDeliver(supplier, 'po:5', { storeIds: [], supplierIds: ['21'] })).toBe(true)
    expect(canDeliver(supplier, 'po:5', { storeIds: [], supplierIds: ['22'] })).toBe(false)
  })

  test('没有仓库模块的财务只收带供应商的手工入库单', () => {
    const finance = staff(['finance'])
    expect(canDeliver(finance, 'wh_doc:5', noScope)).toBe(false)
    expect(canDeliver(finance, 'wh_doc:5', { storeIds: [], supplierIds: ['21'] })).toBe(true)
    expect(canDeliver(staff(['warehouse']), 'wh_doc:5', noScope)).toBe(true)
  })

  test('通配订阅覆盖同类具体主题', () => {
    expect(covers('todo:*', 'todo:sales')).toBe(true)
    expect(covers('ar:*', 'ap:3')).toBe(false)
    expect(covers('orders', 'orders')).toBe(true)
    expect(covers('order:1', 'order:12')).toBe(false)
  })

  test('超过空闲时间才断开', () => {
    expect(isIdle(0, 60_000)).toBe(false)
    expect(isIdle(0, 60_001)).toBe(true)
  })
})
