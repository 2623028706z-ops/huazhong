// 门店端：下单、取消、申请售后校验、改单删光、改登录手机号（07 章 E06–E08，03 章第 8.1 节阶段 3 确认）
import type { AfterDetail, CustomerItem, OrderCard, OrderDetail, StoreItem } from '@huazhong/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, operationLogs } from '../db/schema/index.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import { uploadAfterImage } from './support/images.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

const storeDetail = async (id: string) =>
  dataOf<OrderDetail>(await (await s.as('s1')).get(`/orders/${id}`))

async function storeOrder(): Promise<OrderDetail> {
  const rose = await idBy(s.t, 'products.name', '粉玫瑰日常花束')
  return dataOf<OrderDetail>(
    await (
      await s.as('s1')
    ).post('/store/orders', { note: '', lines: [{ productId: rose, qty: 1 }] }),
  )
}

describe('门店下单和取消', () => {
  test('E06 门店下单：待确认，出货日期为 null，没有变更记录', async () => {
    const created = await storeOrder()
    expect(created).toMatchObject({
      status: 'pending_confirm',
      shipDate: null,
      origin: 'store',
      changes: [],
    })
    const page = dataOf<{ items: OrderCard[] }>(await (await s.as('s1')).get('/orders'))
    expect(page.items.find((o) => o.id === created.id)?.shipDate).toBeNull()
    expect((await storeDetail(created.id)).changes).toEqual([])
  })

  test('E07 门店取消待确认订单：不带原因，cancelReason 为 null，actions 为空', async () => {
    const created = await storeOrder()
    const cancelled = dataOf<OrderDetail>(
      await (
        await s.as('s1')
      ).post(`/store/orders/${created.id}/cancel`, { version: created.version }),
    )
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: null, actions: [] })
  })

  test('改单删光（只剩停用产品全删掉）→ 「请先选择产品」', async () => {
    const o018 = await idBy(s.t, 'orders.no', 'SO-260929-018')
    const opened = await storeDetail(o018)
    const res = await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, { version: opened.version, note: '', lines: [] })
    expect(res.status).toBe(422)
    expect(res.body.error?.message).toBe('请先选择产品')
    expect((await storeDetail(o018)).lines).toHaveLength(2)
  })
})

describe('门店申请售后', () => {
  test('E08 不加产品、数量超过可申请数都拦；问题说明选填，不写也提交成功', async () => {
    const o021 = await idBy(s.t, 'orders.no', 'SO-260927-021')
    const store = await s.as('s1')
    const line = (await storeDetail(o021)).lines.find((l) => l.name === '粉玫瑰日常花束')
    const imageFileId = await uploadAfterImage(s, store)
    const apply = (qty: number, description: string) =>
      store.post('/store/afters', {
        orderId: o021,
        lines: [
          {
            orderLineId: line?.id,
            qty,
            reason: 'damaged',
            description,
            imageFileIds: [imageFileId],
          },
        ],
      })
    const empty = await store.post('/store/afters', { orderId: o021, lines: [] })
    expect(empty.status).toBe(422)
    expect(empty.body.error?.message).toBe('请添加售后产品')
    expect((await apply(16, '两束花头折了')).body.error?.fields).toEqual({
      'lines.0.qty': '售后数量须大于 0，且不超过实发数量减去已申请的售后',
    })
    const saved = dataOf<AfterDetail>(await apply(2, ''))
    expect(saved).toMatchObject({ status: 'pending', origin: 'store' })
    expect(saved.lines[0]).toMatchObject({ requestedQty: 2, description: '' })
  })
})

test('门店改登录手机号：同时解绑微信，日志原因「同时解绑微信」', async () => {
  await s.as('s1')
  const sales = await s.as('u2')
  const page = dataOf<{ items: CustomerItem[] }>(await sales.get('/customers'))
  const store = page.items.flatMap((c) => c.stores).find((item) => item.name === '滨江店')
  if (!store) throw new Error('no 滨江店')
  const saved = dataOf<StoreItem>(
    await sales.patch(`/stores/${store.id}`, {
      version: store.version,
      name: store.name,
      contact: store.contact,
      phone: store.phone,
      address: store.address,
      enabled: store.enabled,
      loginPhone: '13800138011',
    }),
  )
  expect(saved.loginPhone).toBe('13800138011')
  const unbound = await s.t.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.phone, '13800138011'), isNull(accounts.openid)))
  expect(unbound).toHaveLength(1)
  const [log] = await s.t.db
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.action, '修改门店'))
  expect(log).toMatchObject({ module: 'sales', reason: '同时解绑微信' })
})
