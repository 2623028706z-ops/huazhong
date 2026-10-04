import { copy, contract, type Material, type PoDetail, type WhDocDetail } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MaterialReads } from '../src/modules/warehouse/material-reads.ts'
import { Stocktakes } from '../src/modules/warehouse/stocktakes.ts'
import { found } from '../src/common/scope.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import type { ApiResponse } from './support/http.ts'
import { createPo, receiveInput } from './support/purchase.ts'
import { whDocOf, stockQtyOf } from './support/warehouse.ts'
import { connect } from './support/ws.ts'

let sales: SalesApp
beforeEach(async () => {
  sales = await startSales()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await sales.close()
})

async function blockedCount() {
  const result = await sales.t.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count
    FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`)
  return result.rows[0]?.count ?? 0
}
async function freshMaterial() {
  return dataOf<Material>(
    await (
      await sales.as('u5')
    ).post('/materials', {
      name: '并发新花材',
      code: '',
      unit: '枝',
      enabled: true,
      categoryId: await idBy(sales.t, 'material_categories.name', '玫瑰'),
    }),
  )
}
function unitInput(row: Material) {
  return {
    name: row.name,
    code: row.code,
    categoryId: row.categoryId,
    enabled: row.enabled,
    version: row.version,
    unit: '束',
  }
}

test.each(['in', 'out', 'loss', 'po'] as const)(
  '盘点持有花材锁时%s旧单作废等待；即使动作读取尚未见盘点，取得锁后仍拦住且不改库存',
  async (kind) => {
    const warehouse = await sales.as('u5')
    let doc: WhDocDetail | PoDetail
    if (kind === 'po') {
      const po = await createPo(sales)
      doc = dataOf<PoDetail>(
        await warehouse.post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
      )
    } else doc = await whDocOf(sales, kind)
    const materialId = doc.lines[0]?.materialId ?? ''
    const row = dataOf<Material>(await warehouse.get(`/materials/${materialId}`))
    const draft = contract.getStocktakeDraft.response.parse(
      dataOf(await warehouse.get(`/stocktakes/draft?categoryIds=${row.categoryId}`)),
    )
    const stocktakes = sales.t.app.get(Stocktakes)
    const original = stocktakes.draft.bind(stocktakes)
    let voiding: Promise<ApiResponse> | undefined
    const spy = vi.spyOn(stocktakes, 'draft').mockImplementationOnce(async (...args) => {
      const latest = await original(...args)
      voiding = warehouse.post(
        `${kind === 'po' ? '/purchase-orders' : '/warehouse/docs'}/${doc.id}/void`,
        { version: doc.version, reason: '并发误录' },
      )
      await expect.poll(blockedCount).toBe(1)
      return latest
    })
    try {
      const result = await warehouse.post('/stocktakes', {
        categoryIds: [row.categoryId],
        reason: '',
        lines: draft.lines.map((line) => ({
          materialId: line.materialId,
          bookQty: line.bookQty,
          actualQty: line.bookQty,
        })),
      })
      expect(result.status).toBe(200)
      expect(await voiding).toMatchObject({
        status: 409,
        body: { error: { message: copy.stock.voidAfterStocktake } },
      })
      expect(await stockQtyOf(sales, materialId)).toBe(
        draft.lines.find((line) => line.materialId === materialId)?.bookQty,
      )
    } finally {
      spy.mockRestore()
      await voiding
    }
  },
)

test('首次引用持有业务共享锁直到提交，改单位等待后发现配方引用而拒绝', async () => {
  const warehouse = await sales.as('u5')
  const row = await freshMaterial()
  const blocker = new pg.Client({ connectionString: sales.t.databaseUrl })
  await blocker.connect()
  let editing: Promise<ApiResponse> | undefined
  try {
    await blocker.query('BEGIN')
    await blocker.query(
      "SELECT pg_advisory_xact_lock_shared(hashtextextended('business-write', 0))",
    )
    editing = warehouse.patch(`/materials/${row.id}`, unitInput(row))
    await expect.poll(blockedCount).toBe(1)
    await blocker.query(
      `INSERT INTO product_bom_lines (product_id,material_id,qty,created_by)
      SELECT id,$1,1,created_by FROM products ORDER BY id LIMIT 1`,
      [row.id],
    )
    await blocker.query('COMMIT')
    expect(await editing).toMatchObject({
      status: 409,
      body: { error: { message: copy.stock.unitInUse } },
    })
    expect(dataOf<Material>(await warehouse.get(`/materials/${row.id}`)).unit).toBe('枝')
  } finally {
    await blocker.query('ROLLBACK')
    await editing
    await blocker.end()
  }
})

test('改单位先持有独占业务锁，首次手工入库等待后使用新单位，不会旧快照和新库存混用', async () => {
  const warehouse = await sales.as('u5')
  const row = await freshMaterial()
  const supplierId = await idBy(sales.t, 'suppliers.name', '春禾花材')
  const reads = sales.t.app.get(MaterialReads)
  const original = reads.item.bind(reads)
  let incoming: Promise<ApiResponse> | undefined
  const spy = vi.spyOn(reads, 'item').mockImplementationOnce(async (...args) => {
    const before = await original(...args)
    incoming = warehouse.post('/warehouse/docs', {
      kind: 'in',
      supplierId,
      reason: '',
      lines: [{ materialId: row.id, qty: 1, priceCents: 0 }],
    })
    await expect.poll(blockedCount).toBe(1)
    return before
  })
  try {
    expect((await warehouse.patch(`/materials/${row.id}`, unitInput(row))).status).toBe(200)
    const received = dataOf<WhDocDetail>(await found(incoming))
    expect(received.lines[0]?.unit).toBe('束')
    expect(dataOf<Material>(await warehouse.get(`/materials/${row.id}`)).unit).toBe('束')
  } finally {
    spy.mockRestore()
    await incoming
  }
})

test('无差异盘点也通知已打开的旧单详情和列表刷新作废动作', async () => {
  const warehouse = await sales.as('u5')
  const doc = await whDocOf(sales, 'out')
  const row = dataOf<Material>(await warehouse.get(`/materials/${doc.lines[0]?.materialId ?? ''}`))
  const draft = contract.getStocktakeDraft.response.parse(
    dataOf(await warehouse.get(`/stocktakes/draft?categoryIds=${row.categoryId}`)),
  )
  const ws = await connect(sales.t, warehouse.openid)
  try {
    const topic = `wh_doc:${doc.id}` as const
    ws.send({ op: 'subscribe', topics: [topic, 'wh_docs', 'pos'] })
    await ws.sync()
    expect(
      (
        await warehouse.post('/stocktakes', {
          categoryIds: [row.categoryId],
          reason: '',
          lines: draft.lines.map((line) => ({
            materialId: line.materialId,
            bookQty: line.bookQty,
            actualQty: line.bookQty,
          })),
        })
      ).status,
    ).toBe(200)
    for (const changed of [topic, 'wh_docs', 'pos'])
      expect(
        await ws.next((message) => message.op === 'changed' && message.topic === changed),
      ).toEqual({ op: 'changed', topic: changed, version: null })
  } finally {
    ws.close()
  }
})
