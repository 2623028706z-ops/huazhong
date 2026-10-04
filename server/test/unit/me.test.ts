// 登录落点、「我的」入口（05 章第 2 节）
import { expect, test } from 'vitest'
import type { Viewer } from '../../src/common/domain/viewer.ts'
import { landingOf, menusOf } from '../../src/modules/accounts/domain/me.ts'

const base: Viewer = {
  accountId: 1,
  type: 'staff',
  name: 'x',
  phone: '13700000009',
  modules: [],
  storeId: null,
  customerId: null,
  supplierId: null,
  orgLabel: null,
  storeName: null,
}

test('没有模块的员工（数据异常）落在花众首页', () => {
  expect(landingOf(base)).toBe('home')
})

test('只有仓库模块的员工：落在仓库首页，没有库存查询入口', () => {
  const viewer = { ...base, modules: ['warehouse'] as const }
  expect(landingOf(viewer)).toBe('module:warehouse')
  expect(menusOf(viewer)).toEqual(['logs'])
})

test('管理员的「我的」入口：库存查询、操作日志、员工与岗位', () => {
  expect(menusOf({ ...base, type: 'admin' })).toEqual(['inventory', 'logs', 'staff'])
})
