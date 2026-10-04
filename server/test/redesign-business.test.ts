import type {
  contract,
  CustomerItem,
  OrderDetail,
  OutputOf,
  PoDetail,
  ShippingDetail,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { materials, statements, stockBatches } from '../db/schema/index.ts'
import { uploadAfterImage } from './support/images.ts'
import { dataOf, idBy, startSales, TODAY, TOMORROW, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const order = async (id: string): Promise<OrderDetail> =>
  dataOf(await (await s.as('u2')).get(`/orders/${id}`))

describe('统一确认与批量操作', () => {
  test('仅改备注无需原因；产品数量变化必须说明，首次出货日期不记改单', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const sales = await s.as('u2')
    const before = await order(id)
    const changed = before.lines.map((line) => ({
      productId: line.productId,
      qty: line.qty + 1,
      priceCents: line.priceCents,
    }))
    const rejected = await sales.post(`/orders/${id}/confirm`, {
      version: before.version,
      shipDate: TOMORROW,
      lines: changed,
    })
    expect(rejected.body.error?.fields).toEqual({ reason: '请填写修改原因' })
    expect((await order(id)).version).toBe(before.version)
    const confirmed = dataOf<OrderDetail>(
      await sales.post(`/orders/${id}/confirm`, {
        version: before.version,
        shipDate: TOMORROW,
        note: '电话已核对',
      }),
    )
    expect(confirmed.status).toBe('to_ship')
    expect(confirmed.confirmedAt).not.toBeNull()
    expect(confirmed.changes.map((change) => change.items)).toEqual([['修改备注']])
  })

  test('批量确认逐单提交：失败不回滚成功，并返回失败单号', async () => {
    const readyId = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const invalidId = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const ready = await order(readyId)
    const invalid = await order(invalidId)
    const result = dataOf<OutputOf<typeof contract.batchConfirmOrders>>(
      await (
        await s.as('u2')
      ).post('/orders/batch-confirm', {
        orders: [
          { id: ready.id, version: ready.version },
          { id: invalid.id, version: invalid.version },
        ],
        shipDate: TOMORROW,
      }),
    )
    expect(result.succeeded).toEqual([{ id: ready.id, no: ready.no }])
    expect(result.failed).toMatchObject([{ id: invalid.id, no: invalid.no }])
    expect(result.failed[0]?.reason).toBeTruthy()
    expect((await order(ready.id)).status).toBe('to_ship')
    expect((await order(invalid.id)).version).toBe(invalid.version)
  })

  test('并发同版本只确认一次；批量重复ID在提交前拒绝', async () => {
    const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const before = await order(id)
    const sales = await s.as('u2')
    const request = { orders: [{ id, version: before.version }], shipDate: TOMORROW }
    const duplicate = await sales.post('/orders/batch-confirm', {
      ...request,
      orders: [...request.orders, ...request.orders],
    })
    expect(duplicate.status).toBe(422)
    const responses = await Promise.all([
      sales.post('/orders/batch-confirm', request),
      sales.post('/orders/batch-confirm', request),
    ])
    const results = responses.map((response) =>
      dataOf<OutputOf<typeof contract.batchConfirmOrders>>(response),
    )
    expect(results.reduce((sum, result) => sum + result.succeeded.length, 0)).toBe(1)
    expect(results.reduce((sum, result) => sum + result.failed.length, 0)).toBe(1)
    expect((await order(id)).version).toBe(before.version + 1)
  })

  test('批量发货实发取锁内订单数量；未来单失败且所有发货详情不带金额', async () => {
    const dueId = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const futureId = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const due = await order(dueId)
    const pending = await order(futureId)
    const future = dataOf<OrderDetail>(
      await (
        await s.as('u2')
      ).post(`/orders/${futureId}/confirm`, {
        version: pending.version,
        shipDate: TOMORROW,
      }),
    )
    const shipping = await s.as('u7')
    const result = dataOf<OutputOf<typeof contract.batchShipOrders>>(
      await shipping.post('/orders/batch-ship', {
        orders: [
          { id: due.id, version: due.version },
          { id: future.id, version: future.version },
        ],
      }),
    )
    expect(result.succeeded).toEqual([{ id: due.id, no: due.no }])
    expect(result.failed[0]).toMatchObject({
      id: future.id,
      no: future.no,
      reason: '出货日期还没到，不能发货',
    })
    const detail = dataOf<ShippingDetail>(await shipping.get(`/shipping/orders/${dueId}`))
    expect(detail.lines.map((line) => line.shippedQty)).toEqual(due.lines.map((line) => line.qty))
    expect('amountCents' in detail).toBe(false)
    expect(detail.lines.every((line) => !('priceCents' in line))).toBe(true)
    expect(typeof detail.contactName).toBe('string')
    expect(typeof detail.contactPhone).toBe('string')
    expect(typeof detail.address).toBe('string')
  })
})

test('四种门店售后每行说明和图片必填；本人合法图片可提交', async () => {
  const id = await idBy(s.t, 'orders.no', 'SO-260927-021')
  const before = await order(id)
  const store = await s.as('s1')
  const line = before.lines.find((item) => item.maxQty && item.maxQty > 0)
  if (!line) throw new Error('expected claimable line')
  for (const reason of ['damaged', 'quality', 'qty_mismatch', 'other']) {
    const missing = await store.post('/store/afters', {
      orderId: id,
      lines: [{ orderLineId: line.id, qty: 1, reason, description: '', imageFileIds: [] }],
    })
    expect(missing.status).toBe(422)
    expect(missing.body.error?.fields).toMatchObject({
      'lines.0.description': '请填写每项产品的问题说明',
      'lines.0.imageFileIds': '请至少上传 1 张图片',
    })
  }
  const image = await uploadAfterImage(s, store)
  const saved = dataOf(
    await store.post('/store/afters', {
      orderId: id,
      lines: [
        {
          orderLineId: line.id,
          qty: 1,
          reason: 'other',
          description: '请核对配送情况',
          imageFileIds: [image],
        },
      ],
    }),
  )
  expect(saved).toMatchObject({ status: 'pending' })
})

test('客户列表按有效未结清DZ聚合逾期金额和最早天数', async () => {
  const customerId = Number(await idBy(s.t, 'customers.name', '晨曦花艺'))
  await s.t.db
    .update(statements)
    .set({ dueDate: '2026-09-27' })
    .where(eq(statements.no, 'DZ-260929-001'))
  const result = dataOf<{ items: CustomerItem[] }>(await (await s.as('u2')).get('/customers'))
  expect(result.items.find((item) => Number(item.id) === customerId)?.overdue).toEqual({
    amountCents: 358800,
    days: 2,
  })
  const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
  expect((await order(id)).overdue).toEqual({ amountCents: 358800, days: 2 })
  const financial = dataOf<OrderDetail>(await (await s.as('u1')).get(`/finance/orders/${id}`))
  expect(financial.actions).toEqual([])
})

test('取消申请待办只列仍待处理请求，撤回后移出筛选', async () => {
  const id = await idBy(s.t, 'orders.no', 'SO-260929-018')
  const pending = await order(id)
  const before = dataOf<OrderDetail>(
    await (
      await s.as('u2')
    ).post(`/orders/${id}/confirm`, { version: pending.version, shipDate: TODAY }),
  )
  const store = await s.as('s1')
  const requested = dataOf<OrderDetail>(
    await store.post(`/store/orders/${id}/cancel-request`, {
      version: before.version,
      reason: '暂时不用',
    }),
  )
  expect(requested.cancelRequests.at(-1)?.requestedBy).toBe(`门店 ${before.storeName}`)
  const sales = await s.as('u2')
  const page = dataOf<OutputOf<typeof contract.listOrders>>(
    await sales.get('/orders?cancelRequested=true'),
  )
  expect(page.items.map((item) => item.id)).toContain(id)
  dataOf(
    await store.post(`/store/orders/${id}/cancel-request/withdraw`, { version: requested.version }),
  )
  const cleared = dataOf<OutputOf<typeof contract.listOrders>>(
    await sales.get('/orders?cancelRequested=true'),
  )
  expect(cleared.items.map((item) => item.id)).not.toContain(id)
})

test('进有效DZ后订单作废锁定，并同步显示所属对账单', async () => {
  const id = await idBy(s.t, 'orders.no', 'SO-260927-021')
  const before = dataOf<OrderDetail>(await (await s.as('u1')).get(`/orders/${id}`))
  expect(before.statement).toMatchObject({ no: 'DZ-260929-001', status: 'unsettled' })
  expect(before.actions.find((action) => action.code === 'voidOrder')).toMatchObject({
    enabled: false,
    disabledReason: '已进对账单 DZ-260929-001，请先由财务作废对账单',
  })
  const rejected = await (
    await s.as('u1')
  ).post(`/orders/${id}/void`, { version: before.version, reason: '填错了' })
  expect(rejected.body.error).toMatchObject({
    code: 'BUSINESS_RULE',
    message: '已进对账单 DZ-260929-001，请先由财务作废对账单',
  })
  expect((await order(id)).status).toBe('shipped')
})

test('库龄排除耗尽批次；满3天按花材去重并在分页前筛选，上海跨日刷新', async () => {
  const actor = Number(await idBy(s.t, 'accounts.phone', '13700000005'))
  const category = Number(await idBy(s.t, 'material_categories.name', '玫瑰'))
  const [material] = await s.t.db
    .insert(materials)
    .values({
      code: 'HC-9000',
      name: '库龄测试玫瑰',
      categoryId: category,
      unit: '枝',
      createdBy: actor,
    })
    .returning()
  if (!material) throw new Error('expected material')
  await s.t.db.insert(stockBatches).values([
    { materialId: material.id, inDate: '2026-09-01', qty: 10, leftQty: 0, createdBy: actor },
    { materialId: material.id, inDate: '2026-09-27', qty: 10, leftQty: 2, createdBy: actor },
    { materialId: material.id, inDate: TODAY, qty: 10, leftQty: 3, createdBy: actor },
  ])
  const warehouse = await s.as('u5')
  const detail = dataOf<OutputOf<typeof contract.getMaterial>>(
    await warehouse.get(`/materials/${material.id}`),
  )
  expect(detail).toMatchObject({ stockQty: 5, oldestAgeDays: 2, aged: false })
  expect(detail.actions.map((action) => action.code)).toEqual([
    'stockIn',
    'edit',
    'stockOut',
    'reportLoss',
  ])
  expect(detail.batches.map((batch) => batch.ageDays)).toEqual([2, 0])
  s.clock.set('2026-09-29T16:00:00.000Z')
  const aged = dataOf<OutputOf<typeof contract.warehouseStock>>(
    await warehouse.get('/warehouse/stock?aged=true&q=库龄测试&limit=1'),
  )
  expect(aged.items).toHaveLength(1)
  expect(aged.items[0]).toMatchObject({
    id: String(material.id),
    oldestAgeDays: 3,
    aged: true,
    stockQty: 5,
  })
  const readonly = dataOf<{ items: Record<string, unknown>[] }>(
    await (await s.as('u2')).get('/inventory?q=库龄测试'),
  )
  expect(readonly.items[0]).not.toHaveProperty('oldestAgeDays')
  await s.t.db
    .update(stockBatches)
    .set({ leftQty: 0 })
    .where(eq(stockBatches.materialId, material.id))
  const empty = dataOf<OutputOf<typeof contract.getMaterial>>(
    await warehouse.get(`/materials/${material.id}`),
  )
  expect(empty).toMatchObject({ stockQty: 0, oldestAgeDays: null, aged: false })
  const other = dataOf<OutputOf<typeof contract.warehouseStock>>(
    await warehouse.get('/warehouse/stock?aged=false&q=库龄测试'),
  )
  expect(other.items.map((item) => item.id)).toEqual([String(material.id)])
})

test('财务专用采购只读详情能从退货和改价记录解析原采购单', async () => {
  const id = await idBy(s.t, 'purchase_orders.no', 'PO-260928-004')
  const warehouse = await s.as('u5')
  const before = dataOf<PoDetail>(await warehouse.get(`/purchase-orders/${id}`))
  const line = before.lines[0]
  if (!line) throw new Error('expected purchase line')
  const repriced = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${id}/reprice`, {
      version: before.version,
      reason: '供应商核对价格',
      lines: [{ poLineId: line.id, priceCents: line.priceCents + 1 }],
    }),
  )
  const returned = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${id}/returns`, {
      version: repriced.version,
      lines: [{ poLineId: line.id, qty: 1 }],
    }),
  )
  const finance = await s.as('u1')
  for (const [sourceType, childId] of [
    ['purchase_return', returned.returns.at(-1)?.id],
    ['price_change', repriced.priceChanges.at(-1)?.id],
  ]) {
    const detail = dataOf<PoDetail>(
      await finance.get(`/finance/purchase-orders/${childId}?sourceType=${sourceType}`),
    )
    expect(detail.id).toBe(id)
    expect(detail.actions).toEqual([])
  }
})
