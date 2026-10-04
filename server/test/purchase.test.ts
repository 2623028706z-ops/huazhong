import { randomUUID } from 'node:crypto'
import {
  type Me,
  type PoDetail,
  type TodoRow,
  type contract,
  type OutputOf,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { materials, operationLogs } from '../db/schema/index.ts'
import { call } from './support/http.ts'
import { createPo, poInput, poOf, receiveInput, stockQty } from './support/purchase.ts'
import { snapshotInput, codesOf, dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

describe('采购单', () => {
  test('B01 采购登录、待填报待办和权限', async () => {
    const purchase = await s.as('u4')
    expect(dataOf<Me>(await purchase.get('/me'))).toMatchObject({
      landing: 'module:purchase',
      modules: ['purchase'],
    })
    const todo = dataOf<{ count: number; rows: TodoRow[] }>(
      await purchase.get('/modules/purchase/todos'),
    )
    expect(todo.rows).toEqual([
      { key: 'pendingInvites', label: '待填报邀请', count: 1 },
      { key: 'pendingPurchaseOrders', label: '待收货采购单', count: 2 },
    ])
    expect(todo.count).toBe(todo.rows.reduce((count, row) => count + row.count, 0))
    expect((await (await s.as('u5')).post('/purchase-orders', {})).status).toBe(403)
  })
  test('B02 新建校验、整数金额和幂等', async () => {
    const purchase = await s.as('u4')
    const body = {
      supplierId: await idBy(s.t, 'suppliers.name', '滇花源'),
      note: '',
      lines: [
        { materialId: await idBy(s.t, 'materials.name', '白玫瑰'), qty: 60, priceCents: 900 },
        { materialId: await idBy(s.t, 'materials.name', '向日葵'), qty: 50, priceCents: 500 },
      ],
    }
    expect(
      (await purchase.post('/purchase-orders', { ...body, supplierId: '' })).body.error?.fields,
    ).toMatchObject({ supplierId: '请选择供应商' })
    const bad = structuredClone(body)
    bad.lines = bad.lines.map((line, index) => ({ ...line, qty: index === 1 ? 0 : line.qty }))
    expect((await purchase.post('/purchase-orders', bad)).body.error?.fields?.['lines.1.qty']).toBe(
      '采购数量须为大于 0 的整数',
    )
    const missing = { ...body, lines: [{ materialId: body.lines[0]?.materialId, qty: 1 }] }
    expect(
      (await purchase.post('/purchase-orders', missing)).body.error?.fields?.['lines.0.priceCents'],
    ).toBe('请填写单价，赠送的花材填 0')
    const options = {
      openid: purchase.openid,
      body: await snapshotInput(s.t, purchase.openid, '/purchase-orders', body),
      idempotencyKey: randomUUID(),
    }
    const first = dataOf<PoDetail>(await call(s.t, 'POST', '/purchase-orders', options))
    expect(dataOf(await call(s.t, 'POST', '/purchase-orders', options))).toEqual(first)
    expect(first).toMatchObject({
      status: 'to_receive',
      buyerName: '周宁',
      amountCents: 79000,
      units: [{ unit: '枝', qty: 110 }],
    })
    expect(first.no).toMatch(/^PO-/)
    expect(first).not.toHaveProperty('expectedDate')
  })
  test('B03 B06 修改、原因、少收和日志', async () => {
    const purchase = await s.as('u4'),
      wh = await s.as('u5')
    const po = await poOf(s, 'PO-260929-006')
    expect(
      (await purchase.put(`/purchase-orders/${po.id}`, { ...poInput(po), reason: '复核无变更' }))
        .body.error?.message,
    ).toBe('没有修改内容')
    const body = poInput(po)
    body.lines = body.lines.map((line) => ({ ...line, qty: 180 }))
    expect((await purchase.put(`/purchase-orders/${po.id}`, body)).body.error?.fields).toEqual({
      reason: '请填写原因',
    })
    const edited = dataOf<PoDetail>(
      await purchase.put(`/purchase-orders/${po.id}`, { ...body, reason: '供应商只能供 180 枝' }),
    )
    expect(edited).toMatchObject({
      amountCents: 255600,
      changed: true,
      changes: [{ reason: '供应商只能供 180 枝' }],
    })
    const before = await stockQty(s, '粉雪山玫瑰')
    const recv = receiveInput(edited)
    recv.lines = recv.lines.map((line) => ({ ...line, receivedQty: 170 }))
    const received = dataOf<PoDetail>(await wh.post(`/purchase-orders/${po.id}/receive`, recv))
    expect(received).toMatchObject({
      status: 'received',
      amountCents: 241400,
    })
    expect(await stockQty(s, '粉雪山玫瑰')).toBe(before + 170)
    const logs = await s.t.db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.targetId, Number(po.id)))
    expect(logs.map((row) => row.action)).toEqual(
      expect.arrayContaining(['修改采购单', '确认收货']),
    )
    expect(logs.find((row) => row.action === '修改采购单')?.before).toBeTruthy()
  })
  test('B10 J27 填报单不能换供应商；B11 手工单可换，原供应商不可见', async () => {
    const purchase = await s.as('u4')
    const supplied = await poOf(s, 'PO-260929-006'),
      manual = await poOf(s)
    expect(codesOf(supplied.actions)).toEqual(['editPo', 'cancelPo'])
    expect(codesOf(manual.actions)).toContain('changeSupplier')
    const blocked = await purchase.put(`/purchase-orders/${supplied.id}`, {
      ...poInput(supplied),
      supplierId: manual.supplierId,
      reason: '换供应商',
    })
    expect(blocked.body.error?.message).toBe('填报生成的采购单不能换供应商，要换请取消后重下')
    const body = poInput(manual)
    body.supplierId = supplied.supplierId
    body.lines = body.lines.map((line, index) => ({ ...line, qty: index === 0 ? 120 : line.qty }))
    expect((await purchase.put(`/purchase-orders/${manual.id}`, body)).body.error?.fields).toEqual({
      reason: '请填写原因',
    })
    const edited = dataOf<PoDetail>(
      await purchase.put(`/purchase-orders/${manual.id}`, { ...body, reason: '云岭缺货，改春禾' }),
    )
    expect(edited.changes[0]?.items).toEqual(
      expect.arrayContaining(['供应商 云岭花卉 → 春禾花材', '白玫瑰 数量 150 → 120']),
    )
    expect((await (await s.as('p2')).get(`/supplier/purchase-orders/${manual.id}`)).status).toBe(
      404,
    )
    const detail = dataOf<PoDetail>(
      await (await s.as('p1')).get(`/supplier/purchase-orders/${manual.id}`),
    )
    expect(detail.actions).toEqual([])
    expect(detail.changes).toEqual(edited.changes)
  })
  test('B04 B12 取消三端可见、邀请关联状态及仓库过滤', async () => {
    const purchase = await s.as('u4'),
      po = await poOf(s, 'PO-260929-006')
    expect(
      (await purchase.post(`/purchase-orders/${po.id}/cancel`, { version: po.version, reason: '' }))
        .body.error?.fields,
    ).toEqual({ reason: '请填写原因' })
    const cancelled = dataOf<PoDetail>(
      await purchase.post(`/purchase-orders/${po.id}/cancel`, {
        version: po.version,
        reason: '客户取消订单',
      }),
    )
    expect(cancelled.actions).toEqual([])
    for (const who of ['u5', 'p1'] as const) {
      const path = who === 'p1' ? '/supplier/purchase-orders' : '/purchase-orders'
      expect(dataOf<PoDetail>(await (await s.as(who)).get(`${path}/${po.id}`)).cancelReason).toBe(
        '客户取消订单',
      )
    }
    const page = dataOf<OutputOf<typeof contract.listPurchaseOrders>>(
      await (await s.as('u5')).get('/purchase-orders'),
    )
    expect(page.items.map((row) => row.id)).not.toContain(po.id)
    const invited = dataOf<OutputOf<typeof contract.getInvite>>(
      await purchase.get(`/invites/${po.inviteId}`),
    )
    expect(invited.purchaseOrderStatus).toBe('cancelled')
    expect(
      dataOf<OutputOf<typeof contract.listPurchaseOrders>>(
        await (await s.as('u5')).get('/purchase-orders?status=cancelled'),
      ).items,
    ).toHaveLength(1)
  })
  test('B07 H02 修改后旧版本收货被拒，刷新后入库一次', async () => {
    const purchase = await s.as('u4'),
      wh = await s.as('u5'),
      po = await createPo(s)
    const body = poInput(po)
    body.lines = body.lines.map((line) => ({ ...line, qty: 61 }))
    const changed = dataOf<PoDetail>(
      await purchase.put(`/purchase-orders/${po.id}`, { ...body, reason: '调整数量' }),
    )
    const stale = await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(po))
    expect(stale.body.error).toMatchObject({ code: 'STALE', latest: { version: changed.version } })
    const reverted = dataOf<PoDetail>(
      await purchase.put(`/purchase-orders/${po.id}`, {
        ...poInput(changed),
        lines: poInput(po).lines,
        reason: '恢复数量',
      }),
    )
    dataOf(await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(reverted)))
    expect(await stockQty(s, '向日葵')).toBe(120)
  })
  test('B14 停用的花材保留快照且已下单照常收', async () => {
    const po = await createPo(s)
    await s.t.db
      .update(materials)
      .set({ enabled: false, unit: '把' })
      .where(eq(materials.id, Number(po.lines[0]?.materialId)))
    const edited = dataOf<PoDetail>(
      await (
        await s.as('u4')
      ).put(`/purchase-orders/${po.id}`, {
        ...poInput(po),
        note: '保留原花材',
        reason: '补充备注',
      }),
    )
    expect(edited.lines[0]?.unit).toBe('枝')
    expect(
      dataOf<PoDetail>(
        await (await s.as('u5')).post(`/purchase-orders/${po.id}/receive`, receiveInput(edited)),
      ).status,
    ).toBe('received')
    expect(await stockQty(s, '向日葵')).toBe(120)
  })
})
