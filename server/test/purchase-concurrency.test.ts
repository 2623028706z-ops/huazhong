import { type PoDetail, type InviteDetail } from '@huazhong/shared'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createPo, inviteOf, poInput, poOf, receiveInput, stockQty } from './support/purchase.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import { statementInput } from './support/statements.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

test.each(['修改', '取消'])('03 §6 收货与采购%s互斥', async (kind) => {
  const po = await createPo(s),
    wh = await s.as('u5'),
    purchase = await s.as('u4')
  const other =
    kind === '修改'
      ? purchase.put(`/purchase-orders/${po.id}`, {
          ...poInput(po),
          note: '调整',
          reason: '补充备注',
        })
      : purchase.post(`/purchase-orders/${po.id}/cancel`, {
          version: po.version,
          reason: '取消采购',
        })
  const results = await Promise.all([
    wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(po)),
    other,
  ])
  expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  const after = dataOf<PoDetail>(await purchase.get(`/purchase-orders/${po.id}`))
  expect(await stockQty(s, '向日葵')).toBe(after.status === 'received' ? 120 : 60)
})
test.each(['退货', '改价'])('03 §6 新建对账单与%s互斥', async (kind) => {
  const po = await poOf(s, 'PO-260928-004'),
    wh = await s.as('u5'),
    finance = await s.as('u6')
  const snapshot = await statementInput(s, 'supplier', po.supplierId, [{ type: 'po', id: po.id }])
  const other =
    kind === '退货'
      ? wh.post(`/purchase-orders/${po.id}/returns`, {
          version: po.version,
          lines: [{ poLineId: po.lines[0]?.id, qty: 10 }],
        })
      : wh.post(`/purchase-orders/${po.id}/reprice`, {
          version: po.version,
          reason: '让价',
          lines: [{ poLineId: po.lines[0]?.id, priceCents: 750 }],
        })
  const results = await Promise.all([finance.post('/finance/statements', snapshot), other])
  expect(results.map((res) => res.status).sort()).toEqual([200, 409])
  const after = dataOf<PoDetail>(await finance.get(`/purchase-orders/${po.id}`))
  if (results[0].status === 200)
    expect(after).toMatchObject({ statement: { status: 'unsettled' }, amountCents: 96000 })
  else expect(after.statement).toBeNull()
})
test('03 §6 不同采购单退同种花材不超扣库存', async () => {
  const first = await createPo(s),
    second = await createPo(s),
    wh = await s.as('u5')
  const received = await Promise.all(
    [first, second].map(async (po) =>
      dataOf<PoDetail>(await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(po))),
    ),
  )
  const returned = await Promise.all(
    received.map((po) =>
      wh.post(`/purchase-orders/${po.id}/returns`, {
        version: po.version,
        lines: [{ poLineId: po.lines[0]?.id, qty: 60 }],
      }),
    ),
  )
  expect(returned.map((res) => res.status)).toEqual([200, 200])
  expect(await stockQty(s, '向日葵')).toBe(60)
})
test('采购修改邀请与供应商提交互斥，供货快照不可被覆盖', async () => {
  const invite = await inviteOf(s),
    purchase = await s.as('u4'),
    supplier = await s.as('p1')
  const materialId = invite.lines[0]?.materialId
  const result = await Promise.all([
    purchase.put(`/invites/${invite.id}`, {
      version: invite.version,
      lines: [{ materialId, needQty: 70 }],
    }),
    supplier.post(`/supplier/invites/${invite.id}/submit`, {
      version: invite.version,
      lines: [{ materialId, qty: 60, priceCents: 350 }],
    }),
  ])
  expect(result.map((res) => res.status).sort()).toEqual([200, 409])
  const after = dataOf<InviteDetail>(await purchase.get(`/invites/${invite.id}`))
  if (after.status === 'submitted') expect(after.supply[0]?.qty).toBe(60)
  else expect(after.lines[0]?.needQty).toBe(70)
})

test.each(['填报另报', '采购新增'])('03 §6 %s花材与收货按同一顺序取锁，无死锁', async (kind) => {
  const rose = await idBy(s.t, 'materials.name', '粉雪山玫瑰'),
    sunflower = await idBy(s.t, 'materials.name', '向日葵')
  const lines = [rose, sunflower].map((materialId) => ({ materialId, qty: 1, priceCents: 100 }))
  const received = await createPo(s, { lines }),
    edited = await createPo(s)
  const invite = await inviteOf(s),
    wh = await s.as('u5'),
    purchase = await s.as('u4'),
    supplier = await s.as('p1')
  const blocker = new pg.Client({ connectionString: s.t.databaseUrl })
  await blocker.connect()
  const blocked = async () => {
    const rows = await s.t.db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    )
    return rows.rows[0]?.count ?? 0
  }
  try {
    await blocker.query('BEGIN')
    await blocker.query('SELECT id FROM materials WHERE id = $1 FOR UPDATE', [rose])
    const receiving = wh.post(`/purchase-orders/${received.id}/receive`, receiveInput(received))
    await expect.poll(blocked).toBe(1)
    const other =
      kind === '填报另报'
        ? supplier.post(`/supplier/invites/${invite.id}/submit`, {
            version: invite.version,
            lines: [...lines].reverse(),
          })
        : purchase.put(`/purchase-orders/${edited.id}`, {
            ...poInput(edited),
            lines: [...lines].reverse(),
            reason: '补充花材',
          })
    await expect.poll(blocked).toBe(2)
    await blocker.query('ROLLBACK')
    const results = await Promise.all([receiving, other])
    expect(results.map((r) => r.status)).toEqual([200, 200])
  } finally {
    await blocker.query('ROLLBACK')
    await blocker.end()
  }
})
