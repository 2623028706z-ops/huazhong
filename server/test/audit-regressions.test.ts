import {
  type AfterDetail,
  type OrderDetail,
  type OutputOf,
  type PoDetail,
  type StocktakeDraft,
  type contract,
} from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import pg from 'pg'
import { afters, operationLogs, orderLines, productBomLines } from '../db/schema/index.ts'
import { PurchaseDemand } from '../src/modules/purchase/demand.ts'
import { found } from '../src/common/scope.ts'
import { CHANGES_CHANNEL } from '../src/common/changes.ts'
import { WriteService } from '../src/common/write.service.ts'
import { dataOf, idBy, startSales, TODAY, type SalesApp } from './support/sales.ts'
import { createPo, receiveInput } from './support/purchase.ts'
import { whDocOf } from './support/warehouse.ts'

let sales: SalesApp
beforeEach(async () => {
  sales = await startSales()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await sales.close()
})

async function blockedCount() {
  const result = await sales.t.db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`,
  )
  return result.rows[0]?.count ?? 0
}

async function assertLogDetails() {
  const admin = await sales.as('u1')
  const logs = await sales.t.db.select().from(operationLogs)
  for (const log of logs) {
    const detail = dataOf<OutputOf<typeof contract.getLog>>(await admin.get(`/logs/${log.id}`))
    for (const view of [detail.before, detail.after]) {
      if (!view) continue
      expect(view).not.toHaveProperty('ledgerToken')
      expect(Object.values(view).every((value) => typeof value === 'string')).toBe(true)
    }
  }
  return logs
}

test('已发出多包 NOTIFY 后提交失败，全部消息和日志一起回滚', async () => {
  const listener = new pg.Client({ connectionString: sales.t.databaseUrl })
  await listener.connect()
  const delivered: string[] = []
  listener.on('notification', (message) => {
    if (message.channel === CHANGES_CHANNEL) delivered.push(message.payload ?? '')
  })
  try {
    await listener.query(`LISTEN ${CHANGES_CHANNEL}`)
    await listener.query('LISTEN audit_barrier')
    const writes = sales.t.app.get(WriteService)
    const before = await sales.t.db.select().from(operationLogs)
    await expect(
      writes.run(null, async (ctx) => {
        await ctx.tx.execute(sql`CREATE TEMP TABLE audit_parent (id integer PRIMARY KEY)`)
        await ctx.tx.execute(sql`CREATE TEMP TABLE audit_child (
          parent_id integer REFERENCES audit_parent(id) DEFERRABLE INITIALLY DEFERRED)`)
        await ctx.tx.execute(sql`INSERT INTO audit_child VALUES (1)`)
        await ctx.log({
          module: 'finance',
          kind: 'audit',
          action: 'rollback',
          targetType: 'audit',
          targetId: null,
          targetLabel: 'audit',
        })
        ctx.notify(
          Array.from({ length: 800 }, (_, index) => ({
            topic: `receipt:${index + 1}` as const,
            version: null,
          })),
        )
      }),
    ).rejects.toMatchObject({ query: 'commit', cause: { code: '23503' } })
    const barrier = new Promise<void>((resolve) => {
      listener.on('notification', (message) => {
        if (message.channel === 'audit_barrier') resolve()
      })
    })
    await sales.t.db.execute(sql`SELECT pg_notify('audit_barrier', 'done')`)
    await barrier
    expect(delivered).toEqual([])
    expect(await sales.t.db.select().from(operationLogs)).toEqual(before)
  } finally {
    await listener.end()
  }
})

test.each(['po', 'invite'] as const)(
  '采购 %s 在复核至提交期间阻挡真实仓库写入，确认后旧令牌失效',
  async (kind) => {
    const buyer = await sales.as('u4')
    const warehouse = await sales.as('u5')
    const materialId = await idBy(sales.t, 'materials.name', '向日葵')
    const supplierId = await idBy(sales.t, 'suppliers.name', '春禾花材')
    const reviewBody = { kind, supplierId, lines: [{ materialId, qty: 2 }] }
    const reviewed = dataOf<{ reviewToken: string }>(
      await buyer.post('/purchase/review', reviewBody),
    )
    const demand = sales.t.app.get(PurchaseDemand)
    const original = demand.review.bind(demand)
    let warehouseRequest: ReturnType<typeof warehouse.post> | undefined
    const spy = vi.spyOn(demand, 'review').mockImplementation(async (...args) => {
      const snapshot = await original(...args)
      warehouseRequest = warehouse.post('/warehouse/docs', {
        kind: 'loss',
        reason: '并发报损',
        imageFileIds: [],
        lines: [{ materialId, qty: 1 }],
      })
      await expect.poll(blockedCount).toBe(1)
      return snapshot
    })
    const path = kind === 'po' ? '/purchase-orders' : '/invites'
    const body = {
      supplierId,
      reviewToken: reviewed.reviewToken,
      ...(kind === 'po' ? { note: '' } : {}),
      lines: [kind === 'po' ? { materialId, qty: 2, priceCents: 100 } : { materialId, needQty: 2 }],
    }
    const created = await buyer.post(path, body)
    spy.mockRestore()
    expect(created.status).toBe(200)
    expect((await warehouseRequest)?.status).toBe(200)
    expect((await buyer.post(path, body)).status).toBe(409)
  },
)

test('售后旧处理请求不持有售后锁等待客户，真实作废与旧处理请求都正常结束', async () => {
  const seller = await sales.as('u2')
  const orderId = await idBy(sales.t, 'orders.no', 'SO-260927-021')
  const order = dataOf<OrderDetail>(await seller.get(`/orders/${orderId}`))
  const line = found(order.lines[0])
  const after = dataOf<AfterDetail>(
    await seller.post('/afters', {
      orderId,
      note: '',
      lines: [
        {
          orderLineId: line.id,
          qty: 1,
          priceCents: line.priceCents,
          reason: 'qty_mismatch',
          description: '',
        },
      ],
    }),
  )
  const blocker = new pg.Client({ connectionString: sales.t.databaseUrl })
  await blocker.connect()
  let processing: ReturnType<typeof seller.post> | undefined
  let voiding: ReturnType<typeof seller.post> | undefined
  try {
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [order.customerId])
    processing = seller.post(`/afters/${after.id}/process`, {
      version: after.version,
      note: '',
      lines: after.lines.map((item) => ({
        id: item.id,
        qty: item.qty,
        priceCents: item.priceCents,
      })),
    })
    await expect.poll(blockedCount).toBe(1)
    await blocker.query('SELECT id FROM afters WHERE id=$1 FOR UPDATE NOWAIT', [after.id])
    voiding = seller.post(`/afters/${after.id}/void`, {
      version: after.version,
      reason: '撤销登记',
    })
    await expect.poll(blockedCount).toBe(2)
    await blocker.query('ROLLBACK')
    const results = await Promise.all([processing, voiding])
    expect(results.map((result) => result.status)).toEqual([409, 200])
    expect(
      (
        await sales.t.db
          .select()
          .from(afters)
          .where(eq(afters.id, Number(after.id)))
      )[0]?.status,
    ).toBe('voided')
  } finally {
    await blocker.query('ROLLBACK')
    await Promise.all([processing, voiding])
    await blocker.end()
  }
})

test('实际报损和未勾单付款登记后的日志详情符合契约，中文字段且不携带内部令牌', async () => {
  const warehouse = await sales.as('u5')
  const finance = await sales.as('u6')
  const materialId = await idBy(sales.t, 'materials.name', '向日葵')
  const supplierId = await idBy(sales.t, 'suppliers.name', '春禾花材')
  await warehouse.post('/warehouse/docs', {
    kind: 'loss',
    reason: '报损',
    imageFileIds: [],
    lines: [{ materialId, qty: 1 }],
  })
  const payment = await finance.post('/finance/payments', {
    supplierId,
    payDate: TODAY,
    amountCents: 100,
    statements: [],
    methodName: '微信',
    note: '',
  })
  expect(payment.status).toBe(200)
  const logs = await assertLogDetails()
  expect(logs.some((log) => log.targetType === 'wh_docs')).toBe(true)
  expect(logs.some((log) => log.targetType === 'payments')).toBe(true)
})

test('实际收货、改价、退货和手工入库改价的日志详情符合契约', async () => {
  const warehouse = await sales.as('u5')
  const po = await createPo(sales)
  const received = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
  )
  const repriced = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${po.id}/reprice`, {
      version: received.version,
      reason: '议价',
      lines: [{ poLineId: found(received.lines[0]).id, priceCents: 100 }],
    }),
  )
  expect(
    (
      await warehouse.post(`/purchase-orders/${po.id}/returns`, {
        version: repriced.version,
        lines: [{ poLineId: found(repriced.lines[0]).id, qty: 1 }],
      })
    ).status,
  ).toBe(200)
  const incoming = await whDocOf(sales, 'in')
  expect(
    (
      await warehouse.post(`/warehouse/docs/${incoming.id}/reprice`, {
        version: incoming.version,
        reason: '议价',
        lines: [{ lineId: found(incoming.lines[0]).id, priceCents: 100 }],
      })
    ).status,
  ).toBe(200)
  expect(
    (await assertLogDetails()).filter((log) => log.targetType === 'purchase_orders'),
  ).toHaveLength(4)
})

test('实际盘点、分类和退款的日志详情符合契约', async () => {
  const warehouse = await sales.as('u5')
  const finance = await sales.as('u6')
  const categoryId = await idBy(sales.t, 'material_categories.name', '玫瑰')
  const draft = dataOf<StocktakeDraft>(
    await warehouse.get(`/stocktakes/draft?categoryIds=${categoryId}`),
  )
  expect(
    (
      await warehouse.post('/stocktakes', {
        categoryIds: [categoryId],
        reason: '',
        lines: draft.lines.map((line) => ({
          materialId: line.materialId,
          bookQty: line.bookQty,
          actualQty: line.bookQty,
        })),
      })
    ).status,
  ).toBe(200)
  expect(
    (await warehouse.post('/out-categories', { name: '审计领用', enabled: true })).status,
  ).toBe(200)
  const supplierId = await idBy(sales.t, 'suppliers.name', '春禾花材')
  dataOf(
    await finance.post('/finance/payments', {
      supplierId,
      payDate: TODAY,
      amountCents: 100,
      statements: [],
      methodName: '微信',
      note: '',
    }),
  )
  expect(
    (
      await finance.post('/finance/refunds', {
        kind: 'payment',
        supplierId,
        refundDate: TODAY,
        amountCents: 50,
        methodName: '微信',
        note: '',
      })
    ).status,
  ).toBe(200)
  const logs = await assertLogDetails()
  for (const target of ['stocktakes', 'out_categories', 'refunds'])
    expect(logs.some((log) => log.targetType === target)).toBe(true)
})

test('合法 INTEGER 数量与配方产生超安全整数需求时明确拒绝，不返回舍入的复核数据', async () => {
  await sales.t.db.update(orderLines).set({ qty: 2147483647 })
  await sales.t.db.update(productBomLines).set({ qty: 2147483647 })
  const buyer = await sales.as('u4')
  const result = await buyer.get('/purchase/demand')
  expect(result.status).toBe(422)
  expect(result.body.error?.fields).toHaveProperty('lines')
})
