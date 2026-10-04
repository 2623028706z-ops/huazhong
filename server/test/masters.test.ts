// 客户、门店、产品、分类、门店邀请（07 章 A25–A28、A38、E12）
import type { CustomerItem, Me, ProductItem, StoreInviteView, StoreItem } from '@huazhong/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, customers, materials, operationLogs } from '../db/schema/index.ts'
import { phoneCode } from './support/phone.ts'
import { apiOf, dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

async function storeNamed(name: string): Promise<StoreItem> {
  const page = dataOf<{ items: CustomerItem[] }>(await (await s.as('u2')).get('/customers'))
  const store = page.items.flatMap((c) => c.stores).find((item) => item.name === name)
  if (!store) throw new Error(`no store ${name}`)
  return store
}

const storeEdit = (store: StoreItem, change: Partial<StoreItem>) => ({
  version: store.version,
  name: store.name,
  contact: store.contact,
  phone: store.phone,
  address: store.address,
  enabled: store.enabled,
  loginPhone: store.loginPhone ?? '',
  ...change,
})

const tokenOf = (path: string) => new URL(path, 'https://x.invalid').searchParams.get('token') ?? ''
const stranger = () => apiOf(s.t, `openid-stranger-${Math.random()}`)

describe('客户、门店、产品资料', () => {
  test('A38 名称校验、联系人、分类删除', async () => {
    const sales = await s.as('u2')
    const dup = await sales.post('/customers', { name: '晨曦花艺', enabled: true })
    expect(dup.body.error?.fields).toEqual({ name: '已有同名客户' })
    const c1 = await idBy(s.t, 'customers.name', '晨曦花艺')
    const noName = await sales.post('/stores', {
      customerId: c1,
      name: '',
      contact: '',
      phone: '',
      address: '',
      enabled: true,
      loginPhone: '',
    })
    expect(noName.body.error?.fields?.['name']).toBe('请填写门店名称')
    const binjiang = await storeNamed('滨江店')
    const noContact = await sales.patch(
      `/stores/${binjiang.id}`,
      storeEdit(binjiang, { contact: '' }),
    )
    expect(noContact.body.error?.fields).toEqual({ contact: '开通门店账号请填写联系人' })
    dataOf(await sales.patch(`/stores/${binjiang.id}`, storeEdit(binjiang, { contact: '陈店长' })))
    expect(dataOf<Me>(await (await s.as('s1')).get('/me')).name).toBe('陈店长')

    const [rose] = await s.t.db.select().from(materials).where(eq(materials.name, '粉雪山玫瑰'))
    const categoryId = await idOfCategory('花束')
    const product = {
      name: '粉玫瑰日常花束',
      categoryId,
      unit: '束',
      imageFileId: null,
      enabled: true,
    }
    const bom = [{ materialId: `${rose?.id ?? ''}`, qty: 10 }]
    expect((await sales.post('/products', { ...product, bom })).body.error?.fields).toEqual({
      name: '已有同名产品',
    })
    const noBom = await sales.post('/products', { ...product, name: '新花束', bom: [] })
    expect(noBom.body.error?.fields).toEqual({ bom: '请至少添加一种花材' })
    const created = dataOf<ProductItem>(
      await sales.post('/products', { ...product, name: '新花束', bom }),
    )
    expect(created.bom[0]).toMatchObject({
      materialName: '粉雪山玫瑰',
      qty: 10,
      materialEnabled: true,
    })

    const inUse = await sales.del(`/product-categories/${categoryId}`)
    expect(inUse.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '分类中仍有产品，请先移动产品',
    })
    const festival = dataOf<{ id: string; sort: number }>(
      await sales.post('/product-categories', { name: '节日花束' }),
    )
    expect(festival.sort).toBe(3)
    dataOf(await sales.del(`/product-categories/${festival.id}`))
    const logs = await s.t.db
      .select({ action: operationLogs.action })
      .from(operationLogs)
      .where(eq(operationLogs.module, 'sales'))
    expect(logs.map((l) => l.action)).toEqual(
      expect.arrayContaining(['新增分类', '删除分类', '新增产品', '修改门店']),
    )
  })

  test('分类排序：ids 不是全部分类 → STALE；调换后按新顺序', async () => {
    const sales = await s.as('u2')
    const list = dataOf<{ items: { id: string; name: string }[] }>(
      await sales.get('/product-categories'),
    )
    const ids = list.items.map((c) => c.id)
    expect(
      (await sales.put('/product-categories/order', { ids: ids.slice(1) })).body.error?.code,
    ).toBe('STALE')
    const moved = dataOf<{ items: { name: string }[] }>(
      await sales.put('/product-categories/order', { ids: [ids[1], ids[0]] }),
    )
    expect(moved.items.map((c) => c.name)).toEqual(['花束', '单品'])
  })

  test('A28 停用的客户不能下新单，门店订货页被拦', async () => {
    await s.t.db.update(customers).set({ enabled: false }).where(eq(customers.name, '拾光花店'))
    const res = await (
      await s.as('u2')
    ).post('/orders', {
      customerId: await idBy(s.t, 'customers.name', '拾光花店'),
      storeId: await idBy(s.t, 'stores.name', '文新店'),
      shipDate: TODAY,
      note: '',
      lines: [
        { productId: await idBy(s.t, 'products.name', '粉玫瑰日常花束'), qty: 1, priceCents: 7000 },
      ],
    })
    expect(res.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '这个客户已停用，不能再下新单',
    })
    const store = await s.as('s1')
    await s.t.db.update(customers).set({ enabled: false }).where(eq(customers.name, '晨曦花艺'))
    expect(dataOf<{ lockedReason: string }>(await store.get('/store/catalog')).lockedReason).toBe(
      '这个客户已停用，不能再下新单，请联系花众',
    )
  })
})

async function idOfCategory(name: string): Promise<string> {
  const list = dataOf<{ items: { id: string; name: string }[] }>(
    await (await s.as('u2')).get('/product-categories'),
  )
  return list.items.find((c) => c.name === name)?.id ?? ''
}

describe('门店邀请', () => {
  test('A25 重新生成：旧的作废，只有新的有效，7 天有效', async () => {
    const sales = await s.as('u2')
    const chengxi = await storeNamed('城西店')
    dataOf(
      await sales.patch(`/stores/${chengxi.id}`, storeEdit(chengxi, { loginPhone: '13800138009' })),
    )
    const l1 = dataOf<{ path: string }>(await sales.post(`/stores/${chengxi.id}/invites`))
    const l2 = dataOf<{ path: string; expiresAt: string }>(
      await sales.post(`/stores/${chengxi.id}/invites`),
    )
    expect(l2.expiresAt).toBe('2026-10-06T02:00:00.000Z')
    const view1 = dataOf<StoreInviteView>(
      await stranger().get(`/store-invites/${tokenOf(l1.path)}`),
    )
    expect(view1).toMatchObject({
      status: 'voided',
      storeLabel: '晨曦花艺 · 城西店',
      binding: 'none',
    })
    expect(
      dataOf<StoreInviteView>(await stranger().get(`/store-invites/${tokenOf(l2.path)}`)).status,
    ).toBe('pending')
    const list = dataOf<{ items: { status: string }[] }>(
      await sales.get(`/stores/${chengxi.id}/invites`),
    )
    expect(list.items.map((i) => i.status)).toEqual(['pending', 'voided'])
  })

  test('A26 A27 已绑定不能发新邀请；解绑后能发；仓库不能解绑', async () => {
    await s.as('s1')
    const sales = await s.as('u2')
    const bound = await storeNamed('滨江店')
    expect(bound.actions).toEqual([
      {
        code: 'inviteStore',
        enabled: false,
        disabledReason: '这家门店账号已绑定微信，请联系销售解绑',
        reasonRequired: null,
      },
      { code: 'unbindStoreWechat', enabled: true, disabledReason: null, reasonRequired: false },
    ])
    const blocked = await sales.post(`/stores/${bound.id}/invites`)
    expect(blocked.status).toBe(409)
    expect(blocked.body.error?.message).toBe('这家门店账号已绑定微信，请联系销售解绑')
    const body = { version: bound.accountVersion }
    expect((await (await s.as('u5')).post(`/stores/${bound.id}/unbind-wechat`, body)).status).toBe(
      403,
    )
    const unbound = dataOf<StoreItem>(await sales.post(`/stores/${bound.id}/unbind-wechat`, body))
    expect(unbound.actions.map((a) => a.code)).toEqual(['inviteStore'])
    const rows = await s.t.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.phone, '13800138001'), isNull(accounts.openid)))
    expect(rows).toHaveLength(1)
    const again = await sales.post(`/stores/${bound.id}/unbind-wechat`, {
      version: unbound.accountVersion,
    })
    expect(again.body.error?.message).toBe('这家门店账号还没绑定微信')
    dataOf(await sales.post(`/stores/${bound.id}/invites`))
  })

  test('E12 已绑别的账号的微信要先退出；门店手机号绑定后邀请已使用，再打开是 self', async () => {
    const sales = await s.as('u2')
    const binjiang = await storeNamed('滨江店')
    const link = dataOf<{ path: string }>(await sales.post(`/stores/${binjiang.id}/invites`))
    const token = tokenOf(link.path)
    expect(dataOf<StoreInviteView>(await sales.get(`/store-invites/${token}`))).toMatchObject({
      binding: 'other',
      boundLabel: '李敏',
    })
    const other = await sales.post(`/store-invites/${token}/use`, {
      code: phoneCode('13800138001'),
    })
    expect(other.body.error?.message).toBe('这台微信已登录李敏，请先在「我的」退出登录再接受邀请')
    const phone = stranger()
    const wrong = await phone.post(`/store-invites/${token}/use`, {
      code: phoneCode('13800138999'),
    })
    expect(wrong.body.error?.message).toBe('手机号和门店登记的不一致，请用登记的手机号验证')
    const me = dataOf<Me>(
      await phone.post(`/store-invites/${token}/use`, { code: phoneCode('13800138001') }),
    )
    expect(me).toMatchObject({
      type: 'store',
      landing: 'store_shop',
      orgLabel: '晨曦花艺 · 滨江店',
    })
    expect(dataOf<StoreInviteView>(await phone.get(`/store-invites/${token}`))).toMatchObject({
      binding: 'self',
      status: 'used',
    })
    const reuse = await stranger().post(`/store-invites/${token}/use`, {
      code: phoneCode('13800138001'),
    })
    expect(reuse.body.error?.message).toBe('邀请已失效，请联系花众销售重新发送')
    const [log] = await s.t.db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.action, '门店接受邀请'))
    expect(log?.module).toBe('sales')
  })
})
