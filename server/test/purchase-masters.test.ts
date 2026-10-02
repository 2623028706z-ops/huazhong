import {
  type Material,
  type Me,
  type Supplier,
  type contract,
  type OutputOf,
  WS_CLOSE,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { accounts, operationLogs } from '../db/schema/index.ts'
import { phoneCode } from './support/phone.ts'
import { inviteOf, supplierInput, supplierOf } from './support/purchase.ts'
import { apiOf, dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
test('B05 供应商名称校验、停用后旧单照常收货', async () => {
  const api = await s.as('u4')
  const body = {
    name: '',
    contact: '',
    phone: '',
    address: '',
    enabled: true,
    account: { enabled: false, loginPhone: '' },
  }
  expect((await api.post('/suppliers', body)).body.error?.fields).toEqual({
    name: '请填写供应商名称',
  })
  expect((await api.post('/suppliers', { ...body, name: '春禾花材' })).body.error?.fields).toEqual({
    name: '已有同名供应商',
  })
  dataOf(await api.post('/suppliers', { ...body, name: '青禾鲜切' }))
  expect(
    dataOf<OutputOf<typeof contract.listSuppliers>>(await api.get('/suppliers')).items,
  ).toHaveLength(4)
  const supplier = await supplierOf(s, '云岭花卉')
  const changed = dataOf<Supplier>(
    await api.patch(`/suppliers/${supplier.id}`, { ...supplierInput(supplier), enabled: false }),
  )
  expect(changed).toMatchObject({ enabled: false, openPoCount: 1 })
  const res = await api.post('/purchase-orders', {
    supplierId: supplier.id,
    note: '',
    lines: [{ materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 1, priceCents: 350 }],
  })
  expect(res.body.error?.code).toBe('BUSINESS_RULE')
})
test('F05 开账号校验、关闭账号保留绑定及取消邀请，重新开通恢复登录', async () => {
  const api = await s.as('u4'),
    supplier = await supplierOf(s, '滇花源')
  const body = supplierInput(supplier)
  body.account = { enabled: true, loginPhone: '' }
  expect((await api.patch(`/suppliers/${supplier.id}`, body)).body.error?.fields).toEqual({
    'account.loginPhone': '开通供应商端账号请填写 11 位登录手机号',
  })
  body.account.loginPhone = '13900139001'
  expect(
    (await api.patch(`/suppliers/${supplier.id}`, body)).body.error?.fields?.['account.loginPhone'],
  ).toBeTruthy()
  body.account.loginPhone = '13900139003'
  dataOf(await api.patch(`/suppliers/${supplier.id}`, body))
  const external = apiOf(s.t, 'new-supplier-openid')
  expect(
    dataOf<Me>(
      await external.post('/auth/bind-phone', { code: phoneCode(body.account.loginPhone) }),
    ).landing,
  ).toBe('supplier_home')
  const supplierApi = await s.as('p1'),
    spring = await supplierOf(s),
    invite = await inviteOf(s)
  const [before] = await s.t.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, Number(spring.account.id)))
  const ws = await connect(s.t, supplierApi.openid)
  const disabled = dataOf<Supplier>(
    await api.patch(`/suppliers/${spring.id}`, {
      ...supplierInput(spring),
      account: { enabled: false, loginPhone: spring.account.loginPhone },
    }),
  )
  expect(disabled.account).toMatchObject({
    id: spring.account.id,
    enabled: false,
    bound: true,
  })
  expect(await ws.closed).toBe(WS_CLOSE.accountDisabled)
  expect((await supplierApi.get('/me')).body.error?.code).toBe('ACCOUNT_DISABLED')
  const [after] = await s.t.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, Number(spring.account.id)))
  expect(after).toMatchObject({ openid: supplierApi.openid, boundAt: before?.boundAt })
  expect(after?.version).toBe((before?.version ?? 0) + 1)
  expect(await inviteOf(s)).toMatchObject({
    status: 'cancelled',
    cancelNote: '关闭供应商端账号，自动取消',
  })
  const logs = await s.t.db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.targetId, Number(invite.id)))
  expect(logs.find((row) => row.action === '取消填报邀请')).toMatchObject({
    actorLabel: '系统',
    createdBy: null,
  })
  dataOf(
    await api.patch(`/suppliers/${spring.id}`, {
      ...supplierInput(disabled),
      account: { enabled: true, loginPhone: spring.account.loginPhone },
    }),
  )
  expect(dataOf<Me>(await supplierApi.get('/me'))).toMatchObject({
    id: spring.account.id,
    landing: 'supplier_home',
  })
  const restored = await connect(s.t, supplierApi.openid)
  await restored.sync()
  restored.close()
  expect((await inviteOf(s)).status).toBe('cancelled')
})
test('F06 改手机号同时解绑、关闭实时连接、邀请仍待填报', async () => {
  const api = await s.as('u4'),
    supplierApi = await s.as('p1')
  const ws = await connect(s.t, supplierApi.openid),
    supplier = await supplierOf(s)
  const changed = dataOf<Supplier>(
    await api.patch(`/suppliers/${supplier.id}`, {
      ...supplierInput(supplier),
      account: { enabled: true, loginPhone: '13900139999' },
    }),
  )
  expect(changed.version).toBe(supplier.version + 1)
  expect(changed.account.bound).toBe(false)
  expect(await ws.closed).toBe(WS_CLOSE.unauthenticated)
  const [account] = await s.t.db
    .select()
    .from(accounts)
    .where(eq(accounts.id, Number(supplier.account.id)))
  expect(account).toMatchObject({ phone: '13900139999', openid: null, boundAt: null })
  expect(account?.version).toBeGreaterThan(1)
  expect((await inviteOf(s)).status).toBe('pending')
  const logs = await s.t.db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.action, '修改供应商'))
  expect(logs[0]?.reason).toBe('同时解绑微信')
  expect((await supplierApi.get('/supplier/invites')).status).toBe(401)
  expect(
    dataOf<Me>(await supplierApi.post('/auth/bind-phone', { code: phoneCode('13900139999') }))
      .landing,
  ).toBe('supplier_home')
  expect((await supplierApi.get('/supplier/invites')).status).toBe(200)
  expect((await inviteOf(s)).status).toBe('pending')
})
test('C05 G03 花材编码、同名、分类改名、单位和无修改', async () => {
  const wh = await s.as('u5')
  const list = dataOf<OutputOf<typeof contract.listMaterials>>(await wh.get('/materials'))
  expect(list.nextCode).toBe('HC-0006')
  const categoryId = list.items[0]?.categoryId ?? ''
  const input = { code: '', name: '白玫瑰', categoryId, unit: '枝', enabled: true }
  const mat = dataOf<Material>(await wh.post('/materials', input))
  expect(mat.code).toBe('HC-0006')
  const edit = { ...input, code: mat.code, version: mat.version }
  expect((await wh.patch(`/materials/${mat.id}`, edit)).body.error?.message).toBe('没有修改内容')
  expect(
    (await wh.patch(`/materials/${mat.id}`, { ...edit, code: 'HC-0001' })).body.error?.fields,
  ).toEqual({ code: '编码已被其他花材使用' })
  dataOf(await wh.patch(`/material-categories/${categoryId}`, { name: '玫瑰花材', sort: 1 }))
  expect(dataOf<Material>(await wh.get(`/materials/${mat.id}`)).categoryName).toBe('玫瑰花材')
  const rose = list.items.find((row) => row.name === '粉雪山玫瑰')
  const qty = dataOf<{ stockQty: number }>(await wh.get(`/materials/${rose?.id}`)).stockQty
  dataOf(
    await wh.patch(`/materials/${rose?.id}`, { ...rose, categoryId: rose?.categoryId, unit: '把' }),
  )
  expect(dataOf<{ stockQty: number }>(await wh.get(`/materials/${rose?.id}`)).stockQty).toBe(qty)
  const cats = dataOf<OutputOf<typeof contract.listMaterialCategories>>(
    await wh.get('/material-categories'),
  )
  expect(cats.items.some((row) => row.name === '玫瑰花材')).toBe(true)
})
