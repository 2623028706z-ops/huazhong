// GET /me：身份守卫、停用规则、各角色的落点和「我的」入口（05 章第 2 节；07 章 J07、J08、J15、J28）
import { contract, type Me } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, customers, stores, suppliers } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { call } from './support/http.ts'

let t: TestApp
beforeEach(async () => {
  t = await startApp()
})
afterEach(async () => {
  await t.close()
})

const me = (openid?: string) =>
  call(t, contract.me.method, contract.me.path, openid ? { openid } : {})

describe('身份守卫', () => {
  test('没带 openid → 401 UNAUTHENTICATED，响应头带请求 ID', async () => {
    const res = await me()
    expect(res.status).toBe(401)
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '没有绑定账号', fields: null, latest: null },
    })
    expect(res.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('openid 没绑定任何账号 → 401 UNAUTHENTICATED', async () => {
    const res = await me('openid-nobody')
    expect(res.status).toBe(401)
    expect(res.body.error?.code).toBe('UNAUTHENTICATED')
  })

  test('员工账号停用 → 403 ACCOUNT_DISABLED', async () => {
    const openid = await t.bind('u2')
    await t.db.update(accounts).set({ enabled: false }).where(eq(accounts.phone, '13700000002'))
    const res = await me(openid)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatchObject({
      code: 'ACCOUNT_DISABLED',
      message: '账号已停用，请联系花众',
    })
  })

  test('门店停用 → 403「这家门店已停用，请联系花众」', async () => {
    const openid = await t.bind('s1')
    await t.db.update(stores).set({ enabled: false }).where(eq(stores.name, '滨江店'))
    const res = await me(openid)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatchObject({
      code: 'ACCOUNT_DISABLED',
      message: '这家门店已停用，请联系花众',
    })
  })

  test('供应商停用 → 403「这家供应商已停用，请联系花众」', async () => {
    const openid = await t.bind('p1')
    await t.db.update(suppliers).set({ enabled: false }).where(eq(suppliers.name, '春禾花材'))
    const res = await me(openid)
    expect(res.status).toBe(403)
    expect(res.body.error).toMatchObject({
      code: 'ACCOUNT_DISABLED',
      message: '这家供应商已停用，请联系花众',
    })
  })

  test('客户停用不影响门店账号登录（03 章第 5 节）', async () => {
    const openid = await t.bind('s1')
    await t.db.update(customers).set({ enabled: false }).where(eq(customers.name, '晨曦花艺'))
    const res = await me(openid)
    expect(res.status).toBe(200)
    expect((res.body.data as Me).type).toBe('store')
  })
})

describe('当前账号', () => {
  test('管理员：五个模块、落在花众首页、管理员入口', async () => {
    const res = await me(await t.bind('u1'))
    expect(res.status).toBe(200)
    const data = res.body.data as Me
    expect(data).toMatchObject({
      type: 'admin',
      name: '周总',
      orgLabel: null,
      storeId: null,
      supplierId: null,
      modules: ['sales', 'shipping', 'purchase', 'warehouse', 'finance'],
      landing: 'home',
      menus: ['logs', 'staff'],
    })
    expect(data.id).toMatch(/^[1-9][0-9]*$/)
  })

  test('只有销售模块的员工：落在销售首页，「我的」有库存查询', async () => {
    const data = (await me(await t.bind('u2'))).body.data as Me
    expect(data).toMatchObject({
      type: 'staff',
      modules: ['sales'],
      landing: 'module:sales',
      menus: ['inventory', 'logs'],
    })
  })

  test('销售 + 仓库的员工：落在花众首页，没有库存查询入口', async () => {
    const data = (await me(await t.bind('u3'))).body.data as Me
    expect(data).toMatchObject({
      modules: ['sales', 'warehouse'],
      landing: 'home',
      menus: ['logs'],
    })
  })

  test('门店账号：归属「客户 · 门店」、落在门店首页', async () => {
    const data = (await me(await t.bind('s1'))).body.data as Me
    expect(data).toMatchObject({
      type: 'store',
      name: '陈女士',
      orgLabel: '晨曦花艺 · 滨江店',
      supplierId: null,
      modules: [],
      landing: 'store_home',
      menus: [],
    })
    expect(data.storeId).toMatch(/^[1-9][0-9]*$/)
  })

  test('供应商账号：归属是供应商名称、落在供应商首页', async () => {
    const data = (await me(await t.bind('p2'))).body.data as Me
    expect(data).toMatchObject({
      type: 'supplier',
      orgLabel: '云岭花卉',
      storeId: null,
      modules: [],
      landing: 'supplier_home',
      menus: [],
    })
  })
})
