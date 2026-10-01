import type { Me } from '@huazhong/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { identityOf, isLandingModule, landingUrl, tabsOf } from '../miniprogram/core/session'

vi.mock('../miniprogram/core/config', () => ({
  cloudTarget: () => ({ env: 'test-env', service: 'test-service' }),
}))

const base: Me = {
  id: '2',
  type: 'staff',
  name: '李敏',
  phone: '13700000002',
  orgLabel: null,
  storeId: null,
  supplierId: null,
  modules: ['sales'],
  landing: 'module:sales',
  menus: ['inventory', 'logs'],
}

describe('登录落点和底栏', () => {
  it('只有一个模块的员工落在模块首页，底栏「首页」也指向它', () => {
    expect(landingUrl(base)).toBe('/packages/sales/pages/home/index')
    expect(isLandingModule(base, 'sales')).toBe(true)
    expect(tabsOf(base).map((tab) => tab.url)).toEqual([
      '/packages/sales/pages/home/index',
      '/pages/my/index',
    ])
  })

  it('管理员、多模块员工落在花众首页；门店、供应商落在各自首页', () => {
    expect(landingUrl({ ...base, landing: 'home' })).toBe('/pages/home/index')
    expect(landingUrl({ ...base, landing: 'store_home' })).toBe('/packages/store/pages/home/index')
    expect(landingUrl({ ...base, landing: 'supplier_home' })).toBe(
      '/packages/supplier/pages/home/index',
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

describe('门店底栏', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('门店多一个「购物车」，角标是本机购物车件数', () => {
    const cart = [
      { productId: '1', qty: 2, name: '粉玫瑰日常花束', unit: '束', priceCents: 6800 },
      { productId: '2', qty: 3, name: '白绿清新花束', unit: '束', priceCents: 8000 },
    ]
    vi.stubGlobal('wx', { getStorageSync: (key: string) => (key === 'hz-cart:9' ? cart : '') })
    const store: Me = {
      ...base,
      id: '9',
      type: 'store',
      modules: [],
      landing: 'store_home',
      menus: [],
    }
    const tabs = tabsOf(store)
    expect(tabs.map((tab) => tab.key)).toEqual(['home', 'cart', 'my'])
    expect(tabs[1]?.badge).toBe(5)
  })
})
