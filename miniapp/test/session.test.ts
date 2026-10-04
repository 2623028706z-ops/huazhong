import type { Me } from '@huazhong/shared'
import { describe, expect, it, vi } from 'vitest'
import { identityOf, isLandingModule, landingUrl, tabsOf } from '../miniprogram/core/session'

vi.mock('../miniprogram/core/config', () => ({
  cloudTarget: () => ({ env: 'test-env', service: 'test-service' }),
}))

const base: Me = {
  id: '2',
  type: 'staff',
  name: '李敏',
  phone: '13700000002',
  contactPhone: '',
  orgLabel: null,
  storeId: null,
  supplierId: null,
  modules: ['sales'],
  landing: 'module:sales',
  menus: ['inventory', 'logs'],
}

describe('登录落点和底栏', () => {
  it('单模块员工落在模块首页，销售没有模块底栏', () => {
    expect(landingUrl(base)).toBe('/packages/sales/pages/home/index')
    expect(isLandingModule(base, 'sales')).toBe(true)
    expect(tabsOf(base)).toEqual([])
  })

  it('管理员、多模块员工落在花众首页；门店进订货、供应商进填报', () => {
    expect(landingUrl({ ...base, landing: 'home' })).toBe('/pages/home/index')
    expect(landingUrl({ ...base, landing: 'store_shop' })).toBe('/packages/store/pages/shop/index')
    expect(landingUrl({ ...base, landing: 'supplier_invites' })).toBe(
      '/packages/supplier/pages/invites/index',
    )
    expect(isLandingModule({ ...base, landing: 'home' }, 'sales')).toBe(false)
  })
})

describe('身份行', () => {
  it('管理员写「管理员」，多模块用「、」连', () => {
    expect(identityOf({ ...base, type: 'admin', name: '周总' })).toEqual({
      lead: '管理员',
      person: '周总',
    })
    expect(identityOf({ ...base, name: '王芳', modules: ['sales', 'warehouse'] }).lead).toBe(
      '销售、仓库',
    )
  })

  it('门店、供应商写组织名', () => {
    const store = { ...base, type: 'store' as const, name: '陈女士', orgLabel: '晨曦花艺 · 滨江店' }
    expect(identityOf(store)).toEqual({ lead: '晨曦花艺 · 滨江店', person: '陈女士' })
  })
})

describe('业务底栏', () => {
  it('门店只显示订货、订单、我的', () => {
    const store: Me = { ...base, type: 'store', modules: [], landing: 'store_shop', menus: [] }
    expect(tabsOf(store).map((tab) => tab.key)).toEqual(['shop', 'orders', 'my'])
  })
  it('供应商填报带待填报数', () => {
    const supplier: Me = {
      ...base,
      type: 'supplier',
      modules: [],
      landing: 'supplier_invites',
      menus: [],
    }
    const tabs = tabsOf(supplier, 3)
    expect(tabs.map((tab) => tab.key)).toEqual(['supply', 'orders', 'my'])
    expect(tabs[0]?.badge).toBe(3)
  })
  it('只有仓库单模块员工显示库存一级入口', () => {
    const warehouse: Me = { ...base, modules: ['warehouse'], landing: 'module:warehouse' }
    expect(tabsOf(warehouse).map((tab) => tab.key)).toEqual(['home', 'stock', 'my'])
    expect(
      tabsOf({ ...base, modules: ['sales', 'warehouse'], landing: 'home' }).map((tab) => tab.key),
    ).toEqual(['home', 'my'])
  })
})
