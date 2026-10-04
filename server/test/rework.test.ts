import { found } from '../src/common/scope.ts'
import { type contract, moduleKeys, type OutputOf, type OrderDetail } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  accounts,
  operationLogs,
  accountModules,
  customers,
  catalogCategories,
} from '../db/schema/index.ts'
import { startSales, idBy, dataOf, codesOf, TODAY, type SalesApp } from './support/sales.ts'
import { createPo, receiveInput } from './support/purchase.ts'
let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

test('A 取消申请阻止改单、拒绝不再申请、发货使申请失效；管理员发货也无金额', async () => {
  const store = await s.as('s1'),
    sales = await s.as('u2'),
    admin = await s.as('u1')
  const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const pending = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
  dataOf(await sales.post(`/orders/${id}/confirm`, { version: pending.version, shipDate: TODAY }))
  const initial = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
  const requested = dataOf<OrderDetail>(
    await store.post(`/store/orders/${id}/cancel-request`, {
      version: initial.version,
      reason: '',
    }),
  )
  expect(requested.cancelRequested).toBe(true)
  expect(codesOf(dataOf<OrderDetail>(await sales.get(`/orders/${id}`)).actions)).not.toContain(
    'edit',
  )
  const shipping = dataOf<OutputOf<typeof contract.getShippingOrder>>(
    await admin.get(`/shipping/orders/${id}`),
  )
  expect(shipping).not.toHaveProperty('amountCents')
  expect(shipping).not.toHaveProperty('allocations')
  expect(shipping.lines[0]).not.toHaveProperty('priceCents')
  const done = dataOf<OutputOf<typeof contract.shipOrder>>(
    await admin.post(`/orders/${id}/ship`, {
      version: requested.version,
      shipNote: '多发',
      lines: shipping.lines.map((line) => ({ orderLineId: line.id, shippedQty: line.qty + 1 })),
    }),
  )
  expect(done.cancelRequests[0]?.status).toBe('lapsed')
  expect(done.lines[0]?.over).toBe(true)
  expect(done).not.toHaveProperty('amountCents')
})

test('A2 拒绝取消申请的原因选填：不填也能拒绝，申请记空原因', async () => {
  const store = await s.as('s1'),
    sales = await s.as('u2')
  const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const pending = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
  dataOf(await sales.post(`/orders/${id}/confirm`, { version: pending.version, shipDate: TODAY }))
  const initial = dataOf<OrderDetail>(await store.get(`/orders/${id}`))
  const requested = dataOf<OrderDetail>(
    await store.post(`/store/orders/${id}/cancel-request`, {
      version: initial.version,
      reason: '',
    }),
  )
  const rejected = dataOf<OrderDetail>(
    await sales.post(`/orders/${id}/cancel-request/reject`, { version: requested.version }),
  )
  expect(rejected.cancelRequests[0]).toMatchObject({ status: 'rejected', rejectReason: '' })
})

test('B reviewToken不限制超缺口，首次提交后相同复核令牌不能再次建采购单', async () => {
  const purchase = await s.as('u4')
  const supplierId = await idBy(s.t, 'suppliers.name', '云岭花卉')
  const po = await createPo(s, { supplierId })
  dataOf(await (await s.as('u5')).post(`/purchase-orders/${po.id}/receive`, receiveInput(po)))
  const materialId = await idBy(s.t, 'materials.name', '向日葵')
  const body = { kind: 'po', supplierId, lines: [{ materialId, qty: 9999 }] }
  const preview = dataOf<OutputOf<typeof contract.reviewPurchase>>(
    await purchase.post('/purchase/review', body),
  )
  const input = {
    supplierId,
    reviewToken: preview.reviewToken,
    lines: [{ materialId, qty: 9999, priceCents: 10 }],
    note: '',
  }
  expect((await purchase.post('/purchase-orders', input)).status).toBe(200)
  expect((await purchase.post('/purchase-orders', input)).body.error?.code).toBe('STALE')
  const demand = dataOf<OutputOf<typeof contract.listPurchaseDemand>>(
    await purchase.get('/purchase/demand'),
  )
  expect(demand.mats.every((row) => row.shipFrom <= row.shipTo)).toBe(true)
})

test('G30/G30-F 员工调岗：filterModules是本人全部非公共历史，筛选和他人/公共日志不能越权', async () => {
  const staff = await s.as('u2'),
    admin = await s.as('u1')
  const own = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, staff.openid)))[0],
  )
  const logs = await s.t.db
    .insert(operationLogs)
    .values([
      {
        module: 'sales',
        createdBy: own.id,
        actorLabel: '李敏',
        kind: '订单',
        action: '确认',
        targetType: 'orders',
        targetLabel: '自己销售',
      },
      {
        module: 'finance',
        createdBy: own.id,
        actorLabel: '李敏',
        kind: '收款',
        action: '登记',
        targetType: 'receipts',
        targetLabel: '自己财务',
      },
      {
        module: 'warehouse',
        createdBy: 1,
        actorLabel: '他人',
        kind: '入库',
        action: '入库',
        targetType: 'wh_docs',
        targetLabel: '别人仓库',
      },
      {
        module: null,
        createdBy: own.id,
        actorLabel: '李敏',
        kind: '账号',
        action: '登录',
        targetType: 'accounts',
        targetLabel: '本人公共',
      },
    ])
    .returning()
  await s.t.db.delete(accountModules).where(eq(accountModules.accountId, own.id))
  await s.t.db.insert(accountModules).values({ accountId: own.id, module: 'shipping' })
  const all = dataOf<OutputOf<typeof contract.listLogs>>(
    await staff.get('/logs?module=sales&from=2000-01-01&to=2000-01-02&limit=1'),
  )
  expect(all.items).toEqual([])
  expect(all.filterModules).toEqual(['sales', 'finance'])
  expect((await staff.get(`/logs/${found(logs[2]).id}`)).status).toBe(404)
  expect((await staff.get(`/logs/${found(logs[3]).id}`)).status).toBe(404)
  expect(
    dataOf<OutputOf<typeof contract.listLogs>>(await admin.get('/logs?limit=1')).filterModules,
  ).toEqual([...moduleKeys])
  expect(
    dataOf<OutputOf<typeof contract.listLogs>>(await staff.get('/logs?module=finance')).items,
  ).toHaveLength(1)
  expect((await staff.get('/finance/records')).status).toBe(403)
})

test('X 目录复制预览、空分类复用、编码清空、复制后独立、过期预览挡写', async () => {
  const sales = await s.as('u2')
  const sourceId = await idBy(s.t, 'customers.name', '晨曦花艺')
  const owner = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, sales.openid)))[0],
  )
  const target = found(
    (
      await s.t.db.insert(customers).values({ name: '复制目标', createdBy: owner.id }).returning()
    )[0],
  )
  const source = dataOf<OutputOf<typeof contract.getCatalog>>(
    await sales.get(`/catalog/${sourceId}`),
  )
  const first = found(
    source.categories.find((category) =>
      source.items.some(
        (item) => item.categoryId === category.id && item.enabled && item.productEnabled,
      ),
    ),
  )
  const existing = found(
    (
      await s.t.db
        .insert(catalogCategories)
        .values({ customerId: target.id, name: first.name, sort: 5, createdBy: owner.id })
        .returning()
    )[0],
  )
  const preview = dataOf<OutputOf<typeof contract.previewCatalogCopy>>(
    await sales.get(`/catalog/${target.id}/copy-preview?fromCustomerId=${sourceId}`),
  )
  expect(preview.copyCount).toBeGreaterThan(0)
  const copied = dataOf<OutputOf<typeof contract.copyCatalog>>(
    await sales.post(`/catalog/${target.id}/copy`, {
      fromCustomerId: sourceId,
      previewToken: preview.previewToken,
    }),
  )
  expect(copied.items).toHaveLength(preview.copyCount)
  expect(copied.items.every((item) => item.customerCode === '')).toBe(true)
  expect(copied.categories.find((category) => category.name === first.name)?.id).toBe(
    String(existing.id),
  )
  expect(
    (
      await sales.post(`/catalog/${target.id}/copy`, {
        fromCustomerId: sourceId,
        previewToken: preview.previewToken,
      })
    ).status,
  ).toBe(409)
})
