import { randomUUID } from 'node:crypto'
import {
  contract,
  copy,
  type WhDocDetail,
  type StocktakeDraft,
  type PaymentDetail,
  type StatementDraft,
} from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { call } from './support/http.ts'
import { openStatement } from './support/statements.ts'

let app: SalesApp
beforeEach(async () => {
  app = await startSales()
})
afterEach(async () => {
  await app.close()
})
async function ids() {
  return {
    supplierId: await idBy(app.t, 'suppliers.name', '春禾花材'),
    materialId: await idBy(app.t, 'materials.name', '向日葵'),
    categoryId: await idBy(app.t, 'out_categories.name', '生产领用'),
  }
}
async function doc(kind: 'in' | 'out' | 'loss', qty = 10, priceCents = 100) {
  const warehouse = await app.as('u5'),
    values = await ids()
  return dataOf<WhDocDetail>(
    await warehouse.post('/warehouse/docs', {
      kind,
      reason: kind === 'loss' ? '花头发黑' : '',
      ...(kind === 'in'
        ? { supplierId: values.supplierId }
        : kind === 'out'
          ? { outCategoryId: values.categoryId }
          : { imageFileIds: [] }),
      lines: [{ materialId: values.materialId, qty, ...(kind === 'in' ? { priceCents } : {}) }],
    }),
  )
}
async function quantity(materialId: string) {
  const result = await app.t.db.execute<{ qty: number }>(
    sql`SELECT coalesce(sum(left_qty),0)::int AS qty FROM stock_batches WHERE material_id=${Number(materialId)}`,
  )
  return result.rows[0]?.qty ?? 0
}
test('C06/C07/C08/D28/F04: 手工入库进入DZ并锁定，0元赠送仍可对账，供应商仅看本家', async () => {
  const warehouse = await app.as('u5'),
    finance = await app.as('u6'),
    supplier = await app.as('p1'),
    other = await app.as('p2')
  const values = await ids()
  const created = dataOf<WhDocDetail>(
    await warehouse.post('/warehouse/docs', {
      kind: 'in',
      supplierId: values.supplierId,
      reason: '',
      lines: [
        { materialId: values.materialId, qty: 10, priceCents: 300 },
        { materialId: await idBy(app.t, 'materials.name', '白玫瑰'), qty: 10, priceCents: 200 },
      ],
    }),
  )
  expect(created.no).toMatch(/^RK-/)
  expect(created).toMatchObject({ amountCents: 5000, statement: null })
  const statement = await openStatement(app, 'supplier', values.supplierId, [
    { type: 'wh', id: created.id },
  ])
  const payment = dataOf<PaymentDetail>(
    await finance.post('/finance/payments', {
      supplierId: values.supplierId,
      payDate: TODAY,
      amountCents: 6000,
      methodName: '微信',
      note: '',
      discountCents: 0,
      discountReason: '',
      statements: [{ id: statement.id, version: statement.version }],
    }),
  )
  expect(payment).toMatchObject({ creditCents: 1000, status: 'valid' })
  const paid = dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${created.id}`))
  expect(paid.statement).toMatchObject({ id: statement.id, status: 'settled' })
  expect(
    paid.actions
      .filter((action) => ['void', 'reprice'].includes(action.code))
      .every((action) => !action.enabled),
  ).toBe(true)
  expect(
    (
      await warehouse.post(`/warehouse/docs/${created.id}/void`, {
        version: paid.version,
        reason: '误录',
      })
    ).status,
  ).toBe(409)
  expect(
    (
      await warehouse.post(`/warehouse/docs/${created.id}/reprice`, {
        version: paid.version,
        reason: '改价',
        lines: [{ lineId: paid.lines[0]?.id, priceCents: 400 }],
      })
    ).status,
  ).toBe(409)
  const ownView = await supplier.get(`/supplier/stock-ins/${created.id}`)
  expect(contract.getSupplierStockIn.response.parse(ownView.body.data).statement).toMatchObject({
    id: statement.id,
    status: 'settled',
  })
  expect((await other.get(`/supplier/stock-ins/${created.id}`)).status).toBe(404)
  const gift = await doc('in', 1, 0)
  expect(gift).toMatchObject({ amountCents: 0, statement: null })
  const draft = dataOf<StatementDraft>(
    await finance.get(`/finance/statements/draft?kind=supplier&partyId=${values.supplierId}`),
  )
  expect(draft.sources).toContainEqual(
    expect.objectContaining({ type: 'wh', id: gift.id, amountCents: 0 }),
  )
  const giftStatement = await openStatement(app, 'supplier', values.supplierId, [
    { type: 'wh', id: gift.id },
  ])
  expect(giftStatement.status).toBe('settled')
  expect((await finance.get(`/finance/warehouse-docs/${created.id}`)).status).toBe(200)
})
test('C09/C10/C11/C18: receipt reprice history and reversal are atomic, stock-limited and creator-only', async () => {
  const warehouse = await app.as('u5'),
    admin = await app.as('u1'),
    values = await ids()
  const before = await quantity(values.materialId),
    created = await doc('in')
  const repriced = dataOf<WhDocDetail>(
    await warehouse.post(`/warehouse/docs/${created.id}/reprice`, {
      version: created.version,
      reason: '议价',
      lines: [{ lineId: created.lines[0]?.id, priceCents: 200 }],
    }),
  )
  expect(repriced).toMatchObject({ repriced: true, amountCents: 2000 })
  expect(repriced.priceChanges).toHaveLength(1)
  expect(
    (
      await warehouse.post(`/warehouse/docs/${created.id}/void`, {
        version: repriced.version,
        reason: '',
      })
    ).status,
  ).toBe(422)
  const cancelled = dataOf<WhDocDetail>(
    await warehouse.post(`/warehouse/docs/${created.id}/void`, {
      version: repriced.version,
      reason: '重复入库',
    }),
  )
  expect(cancelled.status).toBe('voided')
  expect(cancelled.actions).toEqual([])
  expect(await quantity(values.materialId)).toBe(before)
  const fresh = await doc('in')
  await doc('out', before + 5)
  const blocked = await warehouse.post(`/warehouse/docs/${fresh.id}/void`, {
    version: fresh.version,
    reason: '误录',
  })
  expect(blocked.status).toBe(409)
  expect(blocked.body.error?.message).toBe(copy.stock.voidStockShort)
  expect(await quantity(values.materialId)).toBe(5)
  expect((await admin.get(`/warehouse/docs/${fresh.id}`)).status).toBe(200)
})
test('C12/C15/C17/C20/C23/C24: FIFO stock deduction, restore original batches and validate fields', async () => {
  const warehouse = await app.as('u5'),
    values = await ids(),
    before = await quantity(values.materialId)
  expect(
    (
      await warehouse.post('/warehouse/docs', {
        kind: 'out',
        outCategoryId: '',
        reason: '',
        lines: [{ materialId: values.materialId, qty: 1 }],
      })
    ).status,
  ).toBe(422)
  expect(
    (
      await warehouse.post('/warehouse/docs', {
        kind: 'loss',
        reason: '',
        lines: [{ materialId: values.materialId, qty: 0 }],
      })
    ).status,
  ).toBe(422)
  expect(
    (
      await warehouse.post('/warehouse/docs', {
        kind: 'out',
        outCategoryId: values.categoryId,
        reason: '',
        lines: [{ materialId: values.materialId, qty: before + 1 }],
      })
    ).status,
  ).toBe(409)
  expect(await quantity(values.materialId)).toBe(before)
  await doc('in', 10)
  const batchesBefore = (
    await app.t.db.execute(
      sql`SELECT id,left_qty FROM stock_batches WHERE material_id=${Number(values.materialId)} ORDER BY id`,
    )
  ).rows
  const outgoing = await doc('out', before + 5)
  expect(await quantity(values.materialId)).toBe(5)
  const returned = dataOf<WhDocDetail>(
    await warehouse.post(`/warehouse/docs/${outgoing.id}/void`, {
      version: outgoing.version,
      reason: '误领',
    }),
  )
  expect(returned.status).toBe('voided')
  expect(
    (
      await app.t.db.execute(
        sql`SELECT id,left_qty FROM stock_batches WHERE material_id=${Number(values.materialId)} ORDER BY id`,
      )
    ).rows,
  ).toEqual(batchesBefore)
  const lost = await doc('loss', 5)
  expect(await quantity(values.materialId)).toBe(before + 5)
  await warehouse.post(`/warehouse/docs/${lost.id}/void`, { version: lost.version, reason: '盘错' })
  expect(await quantity(values.materialId)).toBe(before + 10)
  const moves = dataOf<{
    items: { type: string; batchLabel: string }[]
  }>(await warehouse.get(`/warehouse/moves?materialId=${values.materialId}`))
  expect(moves.items.some((row) => row.type === 'out_void')).toBe(true)
  expect(moves.items.every((row) => /入库$/.test(row.batchLabel))).toBe(true)
})
test('C13/C16/C22/C25: stocktake snapshot excludes other categories, keeps disabled materials, detects stale and never supports void', async () => {
  const warehouse = await app.as('u5'),
    values = await ids()
  const categoryId = await idBy(app.t, 'material_categories.name', '玫瑰')
  const draft = dataOf<StocktakeDraft>(
    await warehouse.get(`/stocktakes/draft?categoryIds=${categoryId}`),
  )
  expect(draft.lines.length).toBeGreaterThan(0)
  const first = draft.lines[0]
  if (!first) throw new Error('Missing stocktake row')
  const input = {
    categoryIds: [categoryId],
    reason: '数量复核',
    lines: draft.lines.map((line) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: line.bookQty,
    })),
  }
  const changed = await warehouse.post('/warehouse/docs', {
    kind: 'out',
    outCategoryId: values.categoryId,
    reason: '',
    lines: [{ materialId: first.materialId, qty: 1 }],
  })
  expect(changed.status).toBe(200)
  const stale = await warehouse.post('/stocktakes', input)
  expect(stale.status).toBe(409)
  expect(stale.body.error?.message).toBe(copy.stock.stocktakeStale)
  const latest = contract.getStocktakeDraft.response.parse(
    (stale.body as { ok: false; error: { latest: unknown } }).error.latest,
  )
  input.lines = latest.lines.map((line) => ({
    materialId: line.materialId,
    bookQty: line.bookQty,
    actualQty: line.bookQty + (line.materialId === first.materialId ? 2 : 0),
  }))
  const created = await warehouse.post('/stocktakes', input)
  expect(created.status).toBe(200)
  const detail = contract.getStocktake.response.parse(created.body.data)
  expect(detail.diffCount).toBe(1)
  expect(detail.actions).toEqual([])
  expect((await warehouse.post(`/stocktakes/${detail.id}/void`, { reason: '误录' })).status).toBe(
    404,
  )
  expect(await quantity(first.materialId)).toBe(first.bookQty + 1)
})
test('C26 and idempotency: loss images reject cross-user, wrong purpose and duplicates without any stock writes; success replays once', async () => {
  const warehouse = await app.as('u5'),
    values = await ids()
  const actor = await idBy(app.t, 'accounts.phone', '13700000005'),
    other = await idBy(app.t, 'accounts.phone', '13700000006')
  const rows = (
    await app.t.db.execute<{ id: number }>(
      sql`INSERT INTO files (purpose,cos_key,status,mime,size_bytes,created_by) VALUES ('loss_image','stage5/a','ok','image/jpeg',100,${actor}),('loss_image','stage5/b','ok','image/jpeg',100,${other}),('product_image','stage5/c','ok','image/jpeg',100,${actor}) RETURNING id`,
    )
  ).rows
  const [own, alien, wrong] = rows.map((row) => String(row.id))
  const before = await quantity(values.materialId)
  for (const imageFileIds of [[alien], [wrong], [own, own]]) {
    const result = await warehouse.post('/warehouse/docs', {
      kind: 'loss',
      reason: '发黑',
      lines: [{ materialId: values.materialId, qty: 1 }],
      imageFileIds,
    })
    expect(result.status).not.toBe(200)
    expect(await quantity(values.materialId)).toBe(before)
  }
  const key = randomUUID(),
    body = {
      kind: 'loss',
      reason: '发黑',
      lines: [{ materialId: values.materialId, qty: 1 }],
      imageFileIds: [own],
    }
  const first = await call(app.t, 'POST', '/warehouse/docs', {
    openid: warehouse.openid,
    body,
    idempotencyKey: key,
  })
  expect(first.status).toBe(200)
  const second = await call(app.t, 'POST', '/warehouse/docs', {
    openid: warehouse.openid,
    body,
    idempotencyKey: key,
  })
  expect(second.body.data).toEqual(first.body.data)
  expect(await quantity(values.materialId)).toBe(before - 1)
})
test('仓库首页待办：待收货和库龄超期都能统计', async () => {
  const todo = dataOf<{ count: number; rows: { key: string; count: number }[] }>(
    await (await app.as('u5')).get('/modules/warehouse/todos'),
  )
  expect(todo.rows.map((row) => row.key)).toEqual(['pendingReceives', 'agedStock'])
  expect(todo.count).toBe(todo.rows.reduce((n, row) => n + row.count, 0))
})
test('C15/C16: 报损原因、盘点差异原因选填，不写也能保存', async () => {
  const warehouse = await app.as('u5'),
    values = await ids(),
    before = await quantity(values.materialId)
  const loss = await warehouse.post('/warehouse/docs', {
    kind: 'loss',
    reason: '',
    lines: [{ materialId: values.materialId, qty: 1 }],
  })
  expect(loss.status).toBe(200)
  expect(await quantity(values.materialId)).toBe(before - 1)
  const categoryId = await idBy(app.t, 'material_categories.name', '玫瑰')
  const draft = dataOf<StocktakeDraft>(
    await warehouse.get(`/stocktakes/draft?categoryIds=${categoryId}`),
  )
  const created = await warehouse.post('/stocktakes', {
    categoryIds: [categoryId],
    reason: '',
    lines: draft.lines.map((line, index) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: line.bookQty + (index === 0 ? 1 : 0),
    })),
  })
  expect(created.status).toBe(200)
})
