// 订单的前置条件：停订 / 停用产品、目录调价同步、门店或客户停用、定出货日期（07 章 A17、A24、A29–A34、J22）
import type { Catalog, OrderDetail } from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { customers, operationLogs, products, stores } from '../db/schema/index.ts'
import { dataOf, idBy, startSales, TODAY, TOMORROW, type SalesApp } from './support/sales.ts'

let s: SalesApp
let o018: string
let c1: string
beforeEach(async () => {
  s = await startSales()
  o018 = await idBy(s.t, 'orders.no', 'SO-260929-018')
  c1 = await idBy(s.t, 'customers.name', '晨曦花艺')
})
afterEach(async () => {
  await s.close()
})

const detail = async (key: 'u2' | 's1' | 'u7', id: string) =>
  dataOf<OrderDetail>(await (await s.as(key)).get(`/orders/${id}`))

const actionOf = (o: OrderDetail, code: string) => o.actions.find((a) => a.code === code)

// 销售在目录里改一项（停订或改价）
async function setCatalog(productName: string, change: { priceCents?: number; enabled?: boolean }) {
  const sales = await s.as('u2')
  const catalog = dataOf<Catalog>(await sales.get(`/catalog/${c1}`))
  const item = catalog.items.find((i) => i.name === productName)
  if (!item) throw new Error(`no catalog item ${productName}`)
  const body = {
    version: item.version,
    categoryId: item.categoryId,
    customerCode: item.customerCode,
    priceCents: change.priceCents ?? item.listPriceCents,
    enabled: change.enabled ?? item.enabled,
  }
  return sales.put(`/catalog/${c1}/items/${item.productId}`, body)
}

const salesLines = (o: OrderDetail, keep: (name: string) => boolean = () => true) =>
  o.lines
    .filter((l) => keep(l.name))
    .map((l) => ({ productId: l.productId, qty: l.qty, priceCents: l.priceCents }))

describe('停订、停用产品', () => {
  test('A17 门店改单遇停订：提交报停订，删掉后提交成功、变更记录含删除', async () => {
    dataOf(await setCatalog('白绿清新花束', { enabled: false }))
    const store = await s.as('s1')
    const opened = await detail('s1', o018)
    expect(opened.lines.find((l) => l.name === '白绿清新花束')?.discontinued).toBe(true)
    const all = opened.lines.map((l) => ({ productId: l.productId, qty: l.qty }))
    const blocked = await store.put(`/store/orders/${o018}`, {
      version: opened.version,
      note: '',
      lines: all,
    })
    expect(blocked.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '白绿清新花束已停订，请先删掉再提交',
    })
    expect((await detail('s1', o018)).lines).toHaveLength(2)
    const kept = all.filter((_l, i) => opened.lines[i]?.name !== '白绿清新花束')
    const saved = dataOf<OrderDetail>(
      await store.put(`/store/orders/${o018}`, {
        version: opened.version,
        note: opened.note ?? '',
        lines: kept,
      }),
    )
    expect(saved.lines.map((l) => l.name)).toEqual(['粉玫瑰日常花束'])
    expect(saved.changes[0]?.items).toContain('删除 白绿清新花束')
  })

  test('A32 待确认单有停订产品：确认禁用、修改并确认可点；不删保存报错，删掉后待发货', async () => {
    dataOf(await setCatalog('白绿清新花束', { enabled: false }))
    const sales = await s.as('u2')
    const opened = await detail('u2', o018)
    expect(actionOf(opened, 'confirm')).toMatchObject({
      enabled: false,
      disabledReason: '白绿清新花束已停订，请修改并确认或取消订单',
    })
    expect(actionOf(opened, 'editAndConfirm')?.enabled).toBe(true)
    const confirm = await sales.post(`/orders/${o018}/confirm`, {
      version: opened.version,
      shipDate: TOMORROW,
    })
    expect(confirm.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '白绿清新花束已停订，请修改并确认或取消订单',
    })
    const edit = {
      version: opened.version,
      shipDate: TOMORROW,
      note: opened.note ?? '',
      reason: '白绿清新停订',
    }
    const blocked = await sales.put(`/orders/${o018}`, { ...edit, lines: salesLines(opened) })
    expect(blocked.body.error?.message).toBe('白绿清新花束已停订，请先删掉再保存')
    const saved = dataOf<OrderDetail>(
      await sales.put(`/orders/${o018}`, {
        ...edit,
        lines: salesLines(opened, (n) => n !== '白绿清新花束'),
      }),
    )
    expect(saved.status).toBe('to_ship')
    expect(saved.changes[0]?.items).toContain('删除 白绿清新花束')
  })

  test('A29 A33 停用产品：目录、新订单加不进；待发货单改单要先删，不改照常发货', async () => {
    const p2 = await idBy(s.t, 'products.name', '白绿清新花束')
    await s.t.db
      .update(products)
      .set({ enabled: false })
      .where(eq(products.id, Number(p2)))
    const sales = await s.as('u2')
    const c3 = await idBy(s.t, 'customers.name', '一间花房')
    const c3Catalog = dataOf<Catalog>(await sales.get(`/catalog/${c3}`))
    const addToC3 = await sales.put(`/catalog/${c3}/items/${p2}`, {
      categoryId: c3Catalog.categories[0]?.id,
      customerCode: '',
      priceCents: 7800,
      enabled: true,
    })
    expect(addToC3.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '白绿清新花束已停用，不能加进订货目录',
    })
    const s2 = await idBy(s.t, 'stores.name', '城西店')
    const create = await sales.post('/orders', {
      customerId: c1,
      storeId: s2,
      shipDate: TODAY,
      note: '',
      lines: [{ productId: p2, qty: 1, priceCents: 7800 }],
    })
    expect(create.body.error?.message).toBe('白绿清新花束已停订，请先删掉再保存')
    const o016 = await idBy(s.t, 'orders.no', 'SO-260929-016')
    const opened = await detail('u2', o016)
    const edit = { version: opened.version, shipDate: TODAY, note: '', reason: '门店减量' }
    const blocked = await sales.put(`/orders/${o016}`, {
      ...edit,
      lines: [{ productId: p2, qty: 18, priceCents: 7800 }],
    })
    expect(blocked.body.error?.message).toBe('白绿清新花束已停订，请先删掉再保存')
    const ship = await detail('u7', o016)
    const shipped = await (
      await s.as('u7')
    ).post(`/orders/${o016}/ship`, {
      version: ship.version,
      shipNote: '',
      lines: ship.lines.map((l) => ({ orderLineId: l.id, shippedQty: l.qty })),
    })
    expect(dataOf<OrderDetail>(shipped).status).toBe('shipped')
  })
})

describe('目录调价同步待确认订单', () => {
  test('A30 待确认单单价跟着变、version +1、不写变更记录；已发货和别的客户不变；门店旧版本提交 STALE', async () => {
    const storeOpened = await detail('s1', o018)
    dataOf(await setCatalog('粉玫瑰日常花束', { priceCents: 7000 }))
    const synced = await detail('u2', o018)
    const rose = synced.lines.find((l) => l.name === '粉玫瑰日常花束')
    expect(rose).toMatchObject({ priceCents: 7000, listPriceCents: 7000, repriced: false })
    expect(synced.amountCents).toBe(218000)
    expect(synced.version).toBe(storeOpened.version + 1)
    expect(synced.changes).toEqual([])
    expect(synced.changed).toBe(false)
    const o026 = await idBy(s.t, 'orders.no', 'SO-260927-026')
    expect((await detail('u2', o026)).lines[0]?.priceCents).toBe(6800)
    const [log] = await s.t.db
      .select()
      .from(operationLogs)
      .where(and(eq(operationLogs.action, '修改订货目录'), eq(operationLogs.targetId, Number(c1))))
    expect(log?.reason).toBe('同步待确认订单 SO-260929-018')
    const lines = storeOpened.lines.map((l) => ({ productId: l.productId, qty: l.qty }))
    const stale = await (
      await s.as('s1')
    ).put(`/store/orders/${o018}`, { version: storeOpened.version, note: '', lines })
    expect(stale.body.error?.code).toBe('STALE')
    expect((stale.body.error?.latest as OrderDetail).lines[0]?.priceCents).toBe(7000)
  })
})

describe('门店、客户停用和出货日期', () => {
  test('J22 门店停用：确认、修改并确认禁用，取消可点；直接调返回同一句；启用后恢复', async () => {
    const s1 = Number(await idBy(s.t, 'stores.name', '滨江店'))
    await s.t.db.update(stores).set({ enabled: false }).where(eq(stores.id, s1))
    const opened = await detail('u2', o018)
    for (const code of ['confirm', 'editAndConfirm']) {
      expect(actionOf(opened, code)).toMatchObject({
        enabled: false,
        disabledReason: '门店已停用，启用后才能确认',
      })
    }
    expect(actionOf(opened, 'cancel')).toMatchObject({ enabled: true, disabledReason: null })
    const res = await (
      await s.as('u2')
    ).post(`/orders/${o018}/confirm`, { version: opened.version, shipDate: TOMORROW })
    expect(res.status).toBe(409)
    expect(res.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '门店已停用，启用后才能确认',
    })
    await s.t.db.update(stores).set({ enabled: true }).where(eq(stores.id, s1))
    expect(actionOf(await detail('u2', o018), 'confirm')).toMatchObject({
      enabled: true,
      disabledReason: null,
    })
  })

  test('A34 客户停用：销售不能确认，门店不能改单、能取消', async () => {
    const store = await s.as('s1')
    await s.t.db
      .update(customers)
      .set({ enabled: false })
      .where(eq(customers.id, Number(c1)))
    const sales = await detail('u2', o018)
    expect(actionOf(sales, 'confirm')?.disabledReason).toBe('客户已停用，启用后才能确认')
    expect(actionOf(sales, 'editAndConfirm')?.disabledReason).toBe('客户已停用，启用后才能确认')
    const opened = await detail('s1', o018)
    expect(actionOf(opened, 'storeEdit')).toMatchObject({
      enabled: false,
      disabledReason: '这个客户已停用，不能再修改订单，请联系花众',
    })
    expect(actionOf(opened, 'storeCancel')?.enabled).toBe(true)
    const lines = opened.lines.map((l) => ({ productId: l.productId, qty: l.qty }))
    const edit = await store.put(`/store/orders/${o018}`, {
      version: opened.version,
      note: '',
      lines,
    })
    expect(edit.body.error?.message).toBe('这个客户已停用，不能再修改订单，请联系花众')
    const cancelled = dataOf<OrderDetail>(
      await store.post(`/store/orders/${o018}/cancel`, { version: opened.version }),
    )
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelReason).toBeNull()
  })

  test('A31 确认订单要选出货日期；确认后不写变更记录，日志记出货日期', async () => {
    const sales = await s.as('u2')
    const opened = await detail('u2', o018)
    const missing = await sales.post(`/orders/${o018}/confirm`, { version: opened.version })
    expect(missing.body.error?.fields).toEqual({ shipDate: '请选择出货日期' })
    const confirmed = dataOf<OrderDetail>(
      await sales.post(`/orders/${o018}/confirm`, { version: opened.version, shipDate: TOMORROW }),
    )
    expect(confirmed).toMatchObject({
      status: 'to_ship',
      shipDate: TOMORROW,
      changed: false,
      changes: [],
    })
    const [log] = await s.t.db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.action, '确认订单'))
    expect(log?.after).toEqual({ 出货日期: TOMORROW })
    expect((await detail('s1', o018)).shipDate).toBe(TOMORROW)
  })
})
