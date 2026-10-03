import { copy, type contract, type OutputOf, type WhDocDetail } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { poOf } from './support/purchase.ts'
import { paymentForDocs, stockQtyOf, whDocOf, whIds } from './support/warehouse.ts'

let app: SalesApp
beforeEach(async () => {
  app = await startSales()
})
afterEach(async () => {
  await app.close()
})

test('C12: unique category names, rename snapshots, disabled options and concurrent keep-one invariant', async () => {
  const api = await app.as('u5')
  const list = dataOf<OutputOf<typeof contract.listOutCategories>>(await api.get('/out-categories'))
  expect(list.items.map((row) => row.name)).toEqual(['生产领用', '门店零售', '样品', '其他'])
  const created = dataOf<OutputOf<typeof contract.createOutCategory>>(
    await api.post('/out-categories', { name: '活动布置', enabled: true }),
  )
  expect((await api.post('/out-categories', { name: '活动布置', enabled: true })).status).toBe(422)
  expect(
    (await api.patch(`/out-categories/${created.id}`, { name: '门店零售', enabled: true })).status,
  ).toBe(422)
  const outgoing = await whDocOf(app, 'out', 1)
  const ids = await whIds(app)
  await api.patch(`/out-categories/${outgoing.outCategoryId}`, { name: '花束领用', enabled: true })
  expect(dataOf<WhDocDetail>(await api.get(`/warehouse/docs/${outgoing.id}`)).outCategoryName).toBe(
    '花束领用',
  )
  await api.patch(`/out-categories/${created.id}`, { name: '活动布置', enabled: false })
  const blocked = await api.post('/warehouse/docs', {
    kind: 'out',
    outCategoryId: created.id,
    reason: '',
    lines: [{ materialId: ids.materialId, qty: 1 }],
  })
  expect(blocked.status).toBe(422)
  expect(blocked.body.error?.fields).toHaveProperty('outCategoryId')
  const results = await Promise.all(
    list.items.map((row) =>
      api.patch(`/out-categories/${row.id}`, {
        name: row.id === outgoing.outCategoryId ? '花束领用' : row.name,
        enabled: false,
      }),
    ),
  )
  expect(results.filter((row) => row.status === 200)).toHaveLength(list.items.length - 1)
  expect(results.find((row) => row.status !== 200)?.body.error?.message).toBe(
    copy.stock.keepOneEnabled,
  )
  expect(
    dataOf<OutputOf<typeof contract.listOutCategories>>(
      await api.get('/out-categories'),
    ).items.filter((row) => row.enabled),
  ).toHaveLength(1)
})

test('C05-S5/C20/C23: disabled materials allow outbound/loss; only creator or admin voids; finance cannot browse loss', async () => {
  const api = await app.as('u5'),
    other = await app.as('u3'),
    admin = await app.as('u1'),
    finance = await app.as('u6')
  const ids = await whIds(app)
  await app.t.db.execute(sql`UPDATE materials SET enabled=false WHERE id=${Number(ids.materialId)}`)
  const before = await stockQtyOf(app, ids.materialId)
  expect(
    (
      await api.post('/warehouse/docs', {
        kind: 'in',
        supplierId: ids.supplierId,
        reason: '',
        lines: [{ materialId: ids.materialId, qty: 1, priceCents: 100 }],
      })
    ).status,
  ).toBe(409)
  const outgoing = await whDocOf(app, 'out', 2),
    loss = await whDocOf(app, 'loss', 1)
  const othersView = dataOf<WhDocDetail>(await other.get(`/warehouse/docs/${loss.id}`))
  expect(othersView.actions.find((row) => row.code === 'void')?.enabled).toBe(false)
  expect(
    (await other.post(`/warehouse/docs/${loss.id}/void`, { version: loss.version, reason: '误录' }))
      .status,
  ).toBe(403)
  expect((await finance.get(`/warehouse/docs/${loss.id}`)).status).toBe(404)
  expect((await (await app.as('p1')).get(`/warehouse/docs/${outgoing.id}`)).status).toBe(403)
  expect(
    (
      await admin.post(`/warehouse/docs/${outgoing.id}/void`, {
        version: outgoing.version,
        reason: '误录',
      })
    ).status,
  ).toBe(200)
  expect(
    (await api.post(`/warehouse/docs/${loss.id}/void`, { version: loss.version, reason: '误录' }))
      .status,
  ).toBe(200)
  expect(await stockQtyOf(app, ids.materialId)).toBe(before)
})

test('C08/D28: mixed purchase/manual IDs never collide; manual docs pay whole, payment locks, withdrawal unlocks; prepaid supports manual docs', async () => {
  const warehouse = await app.as('u5'),
    finance = await app.as('u6')
  const po = await poOf(app, 'PO-260928-004')
  await app.t.db.execute(sql`SELECT setval('wh_docs_id_seq',${Number(po.id)},false)`)
  const incoming = await whDocOf(app, 'in', 10, po.supplierId)
  expect(incoming.id).toBe(po.id)
  const partial = await finance.post(
    '/finance/payments',
    await paymentForDocs(app, po.supplierId, [
      { docType: 'wh', docId: incoming.id, amountCents: 200 },
    ]),
  )
  expect(partial.status).toBe(422)
  expect(JSON.stringify(partial.body)).toContain(copy.stock.stockInPayWhole)
  const allocs = [
    { docType: 'po' as const, docId: po.id, amountCents: 100 },
    { docType: 'wh' as const, docId: incoming.id, amountCents: incoming.amountCents ?? 0 },
  ]
  const payment = dataOf<OutputOf<typeof contract.createPayment>>(
    await finance.post(
      '/finance/payments',
      await paymentForDocs(app, po.supplierId, allocs, 100 + (incoming.amountCents ?? 0)),
    ),
  )
  expect(payment.allocations.map((row) => `${row.docType}:${row.docId}`)).toEqual([
    'po:' + po.id,
    'wh:' + incoming.id,
  ])
  const detail = dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${incoming.id}`))
  expect(detail).toMatchObject({ paidCents: incoming.amountCents, apStatus: 'paid' })
  expect(detail.allocations).toHaveLength(1)
  expect(
    detail.actions
      .filter((row) => row.code === 'void' || row.code === 'reprice')
      .every((row) => !row.enabled),
  ).toBe(true)
  const row = detail.allocations[0]
  if (!row) throw new Error('no manual allocation')
  dataOf(
    await finance.post(`/finance/payment-allocations/${row.id}/revoke`, { reason: '重新核对' }),
  )
  const unlocked = dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${incoming.id}`))
  expect(unlocked.actions.find((action) => action.code === 'reprice')?.enabled).toBe(true)
  const body = await paymentForDocs(app, po.supplierId, [
    { docType: 'wh', docId: incoming.id, amountCents: incoming.amountCents ?? 0 },
  ])
  expect((await finance.post('/finance/prepaid-payment-allocations', body)).status).toBe(200)
  expect(dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${incoming.id}`)).paidCents).toBe(
    incoming.amountCents,
  )
  expect(
    (
      await finance.post(`/finance/payments/${payment.id}/void`, {
        version: payment.version,
        reason: '录错',
      })
    ).status,
  ).toBe(200)
  const voided = await warehouse.post(`/warehouse/docs/${incoming.id}/void`, {
    version: incoming.version,
    reason: '误录',
  })
  expect(voided.status).toBe(200)
})

test('C08: an allocation that pays nothing no longer locks manual repricing and voiding', async () => {
  const warehouse = await app.as('u5'),
    finance = await app.as('u6')
  const incoming = await whDocOf(app, 'in')
  dataOf(
    await finance.post(
      '/finance/payments',
      await paymentForDocs(app, incoming.supplierId ?? '', [
        { docType: 'wh', docId: incoming.id, amountCents: incoming.amountCents ?? 0 },
      ]),
    ),
  )
  await app.t.db.execute(
    sql`UPDATE wh_doc_lines SET price_cents=0 WHERE doc_id=${Number(incoming.id)}`,
  )
  const detail = dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${incoming.id}`))
  expect(detail.paidCents).toBe(0)
  expect(detail.allocations[0]?.effectiveCents).toBe(0)
  expect(
    detail.actions
      .filter((row) => row.code === 'void' || row.code === 'reprice')
      .every((row) => row.enabled),
  ).toBe(true)
})

test('C09/C10: gifts become payable and back; supplier disable is enforced; void removes payable todos', async () => {
  const api = await app.as('u5'),
    finance = await app.as('u6'),
    ids = await whIds(app)
  const incoming = await whDocOf(app, 'in')
  const gift = dataOf<WhDocDetail>(
    await api.post(`/warehouse/docs/${incoming.id}/reprice`, {
      version: incoming.version,
      reason: '供应商赠送',
      lines: incoming.lines.map((line) => ({ lineId: line.id, priceCents: 0 })),
    }),
  )
  expect(gift.apStatus).toBe('no_pay')
  const again = dataOf<WhDocDetail>(
    await api.post(`/warehouse/docs/${incoming.id}/reprice`, {
      version: gift.version,
      reason: '恢复单价',
      lines: gift.lines.map((line) => ({ lineId: line.id, priceCents: 200 })),
    }),
  )
  expect(again.apStatus).toBe('unpaid')
  const todos = dataOf<OutputOf<typeof contract.moduleTodos>>(
    await finance.get('/modules/finance/todos'),
  )
  expect(JSON.stringify(todos)).toContain(incoming.no)
  await api.post(`/warehouse/docs/${incoming.id}/void`, { version: again.version, reason: '重复' })
  expect(JSON.stringify(dataOf(await finance.get('/modules/finance/todos')))).not.toContain(
    incoming.no,
  )
  await app.t.db.execute(sql`UPDATE suppliers SET enabled=false WHERE id=${Number(ids.supplierId)}`)
  expect(
    (
      await api.post('/warehouse/docs', {
        kind: 'in',
        supplierId: ids.supplierId,
        reason: '',
        lines: [{ materialId: ids.materialId, qty: 1, priceCents: 100 }],
      })
    ).status,
  ).toBe(422)
})

test('C13/C16/C22: multiple categories, disabled and zero-stock materials, no difference and concurrent adjustments', async () => {
  const api = await app.as('u5')
  const categoryIds = await Promise.all(
    ['玫瑰', '叶材'].map((name) => idBy(app.t, 'material_categories.name', name)),
  )
  const draft = dataOf<OutputOf<typeof contract.getStocktakeDraft>>(
    await api.get(`/stocktakes/draft?categoryIds=${categoryIds.join(',')}`),
  )
  expect(draft.categories.map((row) => row.name)).toEqual(['玫瑰', '叶材'])
  const first = draft.lines[0]
  if (!first) throw new Error('no stocktake line')
  await app.t.db.execute(
    sql`UPDATE materials SET enabled=false WHERE id=${Number(first.materialId)}`,
  )
  const input = {
    categoryIds,
    reason: '',
    lines: draft.lines.map((line) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: line.bookQty,
    })),
  }
  const checked = dataOf<OutputOf<typeof contract.createStocktake>>(
    await api.post('/stocktakes', input),
  )
  expect(checked).toMatchObject({ diffCount: 0, categories: ['玫瑰', '叶材'] })
  const gain = {
    ...input,
    reason: '补盘',
    lines: input.lines.map((line) => ({ ...line, actualQty: line.actualQty + 1 })),
  }
  const results = await Promise.all([api.post('/stocktakes', gain), api.post('/stocktakes', gain)])
  expect(results.map((row) => row.status).sort()).toEqual([200, 409])
  const stale = results.find((row) => row.status === 409)
  expect(stale?.body.error?.code).toBe('STALE')
  const latest = dataOf<OutputOf<typeof contract.getStocktakeDraft>>(
    await api.get(`/stocktakes/draft?categoryIds=${categoryIds.join(',')}`),
  )
  const zero = {
    categoryIds,
    reason: '全部损耗',
    lines: latest.lines.map((line) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: 0,
    })),
  }
  expect((await api.post('/stocktakes', zero)).status).toBe(200)
  expect(await stockQtyOf(app, first.materialId)).toBe(0)
})

test('C13: stocktake waits for a concurrent material edit instead of deadlocking', async () => {
  const api = await app.as('u5')
  const categoryId = await idBy(app.t, 'material_categories.name', '玫瑰')
  const draft = dataOf<OutputOf<typeof contract.getStocktakeDraft>>(
    await api.get(`/stocktakes/draft?categoryIds=${categoryId}`),
  )
  const first = draft.lines[0]
  if (!first) throw new Error('no stocktake line')
  const input = {
    categoryIds: [categoryId],
    reason: '补盘',
    lines: draft.lines.map((line) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: line.bookQty + 1,
    })),
  }
  // 复现改花材的加锁顺序：先锁花材行，等盘点也来排队后再更新这一行。
  let submitted: ReturnType<typeof api.post> | undefined
  await app.t.db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM materials WHERE id=${Number(first.materialId)} FOR UPDATE`)
    submitted = api.post('/stocktakes', input)
    await expect
      .poll(async () => {
        const rows = await app.t.db.execute(
          sql`SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=current_database()`,
        )
        return rows.rows.length
      })
      .toBeGreaterThan(0)
    await tx.execute(
      sql`UPDATE materials SET version=version+1 WHERE id=${Number(first.materialId)}`,
    )
  })
  expect((await submitted)?.status).toBe(200)
  expect(await stockQtyOf(app, first.materialId)).toBe(first.bookQty + 1)
})

test('C17/C23: concurrent outgoing documents never oversell, duplicate void never restores twice; original reasons are retained', async () => {
  const api = await app.as('u5'),
    ids = await whIds(app)
  const before = await stockQtyOf(app, ids.materialId)
  const input = {
    kind: 'out',
    outCategoryId: ids.outCategoryId,
    reason: '活动领用',
    lines: [{ materialId: ids.materialId, qty: before - 1 }],
  }
  const results = await Promise.all([
    api.post('/warehouse/docs', input),
    api.post('/warehouse/docs', input),
  ])
  expect(results.map((row) => row.status).sort()).toEqual([200, 409])
  expect(await stockQtyOf(app, ids.materialId)).toBe(1)
  const success = results.find((row) => row.status === 200)
  if (!success) throw new Error('no outgoing document')
  const outgoing = dataOf<WhDocDetail>(success)
  const voidInput = { version: outgoing.version, reason: '重复领用' }
  const voids = await Promise.all([
    api.post(`/warehouse/docs/${outgoing.id}/void`, voidInput),
    api.post(`/warehouse/docs/${outgoing.id}/void`, voidInput),
  ])
  expect(voids.map((row) => row.status).sort()).toEqual([200, 409])
  expect(await stockQtyOf(app, ids.materialId)).toBe(before)
  const moves = await app.t.db.execute<{ type: string; reason: string }>(
    sql`SELECT type,reason FROM stock_moves WHERE doc_type='wh' AND doc_id=${Number(outgoing.id)}`,
  )
  expect(
    moves.rows.filter((row) => row.type === 'manual_out').every((row) => row.reason === '活动领用'),
  ).toBe(true)
  expect(
    moves.rows.filter((row) => row.type === 'out_void').every((row) => row.reason === '重复领用'),
  ).toBe(true)
})

test('C11/C20: document filters, composite payable pagination and stale prices do not lose or duplicate rows', async () => {
  const api = await app.as('u5'),
    finance = await app.as('u6')
  const incoming = await whDocOf(app, 'in'),
    outgoing = await whDocOf(app, 'out', 1)
  const inList = dataOf<OutputOf<typeof contract.listWhDocs>>(
    await api.get(
      `/warehouse/docs?kind=in&supplierId=${incoming.supplierId}&from=${TODAY}&to=${TODAY}`,
    ),
  )
  expect(inList.items.map((row) => row.id)).toEqual([incoming.id])
  expect(
    dataOf<OutputOf<typeof contract.listWhDocs>>(
      await api.get('/warehouse/docs?kind=in&status=voided'),
    ).items,
  ).toEqual([])
  const outList = dataOf<OutputOf<typeof contract.listWhDocs>>(
    await api.get(`/warehouse/docs?kind=out&outCategoryId=${outgoing.outCategoryId}`),
  )
  expect(outList.items.map((row) => row.id)).toEqual([outgoing.id])
  const reprice = {
    version: incoming.version,
    reason: '议价',
    lines: incoming.lines.map((line) => ({ lineId: line.id, priceCents: 300 })),
  }
  expect((await api.post(`/warehouse/docs/${incoming.id}/reprice`, reprice)).status).toBe(200)
  expect((await api.post(`/warehouse/docs/${incoming.id}/reprice`, reprice)).status).toBe(409)
  const keys: string[] = []
  let cursor: string | null = null
  do {
    const page: OutputOf<typeof contract.listPayables> = dataOf(
      await finance.get(
        `/finance/payables?limit=1${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`,
      ),
    )
    keys.push(...page.items.map((row) => `${row.docType}:${row.docId}`))
    cursor = page.nextCursor
  } while (cursor)
  expect(new Set(keys).size).toBe(keys.length)
  expect(keys).toContain(`wh:${incoming.id}`)
  expect(keys.some((key) => key.startsWith('po:'))).toBe(true)
})
