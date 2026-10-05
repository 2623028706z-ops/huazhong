import { found } from '../src/common/scope.ts'
import { type contract, type Catalog, type OutputOf, type PoDetail } from '@huazhong/shared'
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import pg from 'pg'
import { afterEach, beforeEach, expect, test } from 'vitest'
import {
  accountModules,
  accounts,
  catalogCategories,
  customers,
  products,
  purchaseOrders,
} from '../db/schema/index.ts'
import { call, type ApiResponse } from './support/http.ts'
import { createPo, poInput, receiveInput } from './support/purchase.ts'
import {
  catalogItemBody,
  dataOf,
  idBy,
  snapshotInput,
  startSales,
  TODAY,
  type SalesApp,
} from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

async function blockedCount() {
  const result = await s.t.db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`,
  )
  return result.rows[0]?.count ?? 0
}
async function moneyInput(kind: 'receipt' | 'payment', name: string) {
  return {
    ...(kind === 'receipt'
      ? { customerId: await idBy(s.t, 'customers.name', name), receiptDate: TODAY }
      : { supplierId: await idBy(s.t, 'suppliers.name', name), payDate: TODAY }),
    amountCents: 1000,
    methodName: '微信',
    note: '',
    statements: [],
  }
}
test.each(['receipt', 'payment'] as const)(
  'D23 %s 独立主体在另一主体行锁等待期间正常完成，非全局串行',
  async (kind) => {
    const finance = await s.as('u6')
    const firstName = kind === 'receipt' ? '晨曦花艺' : '云岭花卉'
    const secondName = kind === 'receipt' ? '拾光花店' : '春禾花材'
    const firstBody = await moneyInput(kind, firstName),
      secondBody = await moneyInput(kind, secondName)
    const ownerId = 'customerId' in firstBody ? firstBody.customerId : firstBody.supplierId
    const blocker = new pg.Client({ connectionString: s.t.databaseUrl })
    await blocker.connect()
    let firstRequest: Promise<ApiResponse> | undefined,
      secondRequest: Promise<ApiResponse> | undefined
    try {
      await blocker.query('BEGIN')
      await blocker.query(
        `SELECT id FROM ${kind === 'receipt' ? 'customers' : 'suppliers'} WHERE id=$1 FOR UPDATE`,
        [ownerId],
      )
      firstRequest = finance.post(`/finance/${kind}s`, firstBody)
      await expect.poll(blockedCount, { timeout: 5000 }).toBe(1)
      let finished: ApiResponse | undefined
      secondRequest = finance.post(`/finance/${kind}s`, secondBody).then((result) => {
        finished = result
        return result
      })
      await expect.poll(() => finished?.status, { timeout: 2500 }).toBe(200)
      expect(await blockedCount()).toBe(1)
      await blocker.query('ROLLBACK')
      expect((await firstRequest).status).toBe(200)
    } finally {
      await blocker.query('ROLLBACK')
      await Promise.all([firstRequest, secondRequest])
      await blocker.end()
    }
  },
)

test.each(['receipt', 'payment'] as const)(
  'D21 D23 %s 相同主体并发登记两笔未勾单资金，两笔均记入余额',
  async (kind) => {
    const finance = await s.as('u6'),
      path = `/finance/${kind}s`
    const body = await moneyInput(kind, kind === 'receipt' ? '晨曦花艺' : '云岭花卉')
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((key) =>
        call(s.t, 'POST', path, { openid: finance.openid, body, idempotencyKey: key }),
      ),
    )
    expect(results.map((result) => result.status)).toEqual([200, 200])
    const funds = results.map((result) => dataOf<{ id: string; creditCents: number }>(result))
    expect(funds.map((fund) => fund.creditCents)).toEqual([1000, 1000])
    expect(new Set(funds.map((fund) => fund.id)).size).toBe(2)
  },
)

test.each(['po', 'invite'] as const)(
  'B40 B41 %s 相同采购复核并发提交不能两次写入',
  async (kind) => {
    const purchase = await s.as('u4'),
      supplierId = await idBy(s.t, 'suppliers.name', '春禾花材'),
      materialId = await idBy(s.t, 'materials.name', '向日葵')
    const path = kind === 'po' ? '/purchase-orders' : '/invites'
    const body = {
      supplierId,
      ...(kind === 'po' ? { note: '' } : {}),
      lines: [kind === 'po' ? { materialId, qty: 2, priceCents: 100 } : { materialId, needQty: 2 }],
    }
    const reviewed = await snapshotInput(s.t, purchase.openid, path, body)
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((key) =>
        call(s.t, 'POST', path, { openid: purchase.openid, body: reviewed, idempotencyKey: key }),
      ),
    )
    expect(results.map((result) => result.status).sort()).toEqual([200, 409])
    expect(results.find((result) => result.status === 409)?.body.error?.code).toBe('STALE')
  },
)

test('B11 两张手工采购单反向换供应商稳定升序取主体锁，无死锁或越权', async () => {
  const purchase = await s.as('u4'),
    springId = await idBy(s.t, 'suppliers.name', '春禾花材'),
    cloudId = await idBy(s.t, 'suppliers.name', '云岭花卉')
  const first = await createPo(s, { supplierId: springId }),
    second = await createPo(s, { supplierId: cloudId })
  const results = await Promise.all([
    purchase.put(`/purchase-orders/${first.id}`, {
      ...poInput(first),
      supplierId: cloudId,
      reason: '改供应商',
    }),
    purchase.put(`/purchase-orders/${second.id}`, {
      ...poInput(second),
      supplierId: springId,
      reason: '改供应商',
    }),
  ])
  expect(results.map((result) => result.status)).toEqual([200, 200])
  expect(dataOf<PoDetail>(found(results[0]))).toMatchObject({ supplierId: cloudId })
  expect(dataOf<PoDetail>(found(results[1]))).toMatchObject({ supplierId: springId })
})

test('B32 B33 采购取消与仓库作废按登记/收货人归属，供应商不能改手工单', async () => {
  const other = await s.as('u2')
  const row = found(
    (await s.t.db.select().from(accounts).where(eq(accounts.openid, other.openid)))[0],
  )
  await s.t.db.insert(accountModules).values([
    { accountId: row.id, module: 'purchase' },
    { accountId: row.id, module: 'warehouse' },
  ])
  const po = await createPo(s)
  expect(
    await other.post(`/purchase-orders/${po.id}/cancel`, { version: po.version, reason: '越权' }),
  ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
  expect(
    await (
      await s.as('p1')
    ).put(`/supplier/purchase-orders/${po.id}`, {
      version: po.version,
      lines: po.lines.map((line) => ({
        materialId: line.materialId,
        qty: line.qty + 1,
        priceCents: line.priceCents,
      })),
    }),
  ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
  const received = dataOf<PoDetail>(
    await (await s.as('u5')).post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
  )
  expect(
    await other.post(`/purchase-orders/${po.id}/void`, {
      version: received.version,
      reason: '越权',
    }),
  ).toMatchObject({ status: 403, body: { error: { code: 'FORBIDDEN' } } })
  expect(
    (
      await s.t.db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, Number(po.id)))
    )[0]?.status,
  ).toBe('received')
})

test('X 复制产品与来源改价共享客户锁，旧预览不复制新价；勾了停用产品不写分类', async () => {
  const sales = await s.as('u2'),
    sourceId = await idBy(s.t, 'customers.name', '晨曦花艺')
  const target = found(
    (await s.t.db.insert(customers).values({ name: '并发复制目标', createdBy: 1 }).returning())[0],
  )
  const source = dataOf<Catalog>(await sales.get(`/catalog/${sourceId}`))
  const item = found(source.items.find((row) => row.enabled))
  const preview = dataOf<OutputOf<typeof contract.catalogCopySources>>(
    await sales.get(`/catalog/${target.id}/copy-sources?fromCustomerId=${sourceId}`),
  )
  const results = await Promise.all([
    sales.post(`/catalog/${target.id}/copy`, {
      fromCustomerId: sourceId,
      productIds: [item.productId],
      previewToken: preview.previewToken,
    }),
    sales.patch(
      `/catalog/${sourceId}/items/${item.productId}`,
      catalogItemBody(item, { priceCents: item.listPriceCents + 100 }),
    ),
  ])
  expect(results[1].status).toBe(200)
  if (results[0].status === 200) {
    expect(
      dataOf<Catalog>(results[0]).items.find((row) => row.name === item.name)?.listPriceCents,
    ).toBe(item.listPriceCents)
  } else expect(results[0].body.error?.code).toBe('STALE')
  const emptyTarget = found(
    (await s.t.db.insert(customers).values({ name: '空目标', createdBy: 1 }).returning())[0],
  )
  const off = found(source.items.find((row) => row.enabled && row.productId !== item.productId))
  await s.t.db
    .update(products)
    .set({ enabled: false })
    .where(eq(products.id, Number(off.productId)))
  const offPreview = dataOf<OutputOf<typeof contract.catalogCopySources>>(
    await sales.get(`/catalog/${emptyTarget.id}/copy-sources?fromCustomerId=${sourceId}`),
  )
  expect(offPreview.items.find((row) => row.productId === off.productId)?.skipReason).toBe(
    'disabled',
  )
  expect(
    (
      await sales.post(`/catalog/${emptyTarget.id}/copy`, {
        fromCustomerId: sourceId,
        productIds: [off.productId],
        previewToken: offPreview.previewToken,
      })
    ).body.error?.code,
  ).toBe('BUSINESS_RULE')
  expect(
    await s.t.db
      .select()
      .from(catalogCategories)
      .where(eq(catalogCategories.customerId, emptyTarget.id)),
  ).toEqual([])
})
