// 日志可见范围、库存查询、门店首页（05 章第 3、5 节；07 章 G26、G27、G28）
import { contract, type InventoryItem, type LogDetail, type LogItem } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, customers, materials, operationLogs } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { call } from './support/http.ts'

let t: TestApp
beforeEach(async () => {
  t = await startApp()
})
afterEach(async () => {
  await t.close()
})

interface Page<T> {
  items: T[]
  nextCursor: string | null
}

const get = (openid: string, path: string) => call(t, 'GET', path, { openid })

describe('操作日志', () => {
  async function seedLogs(): Promise<{ salesId: number; publicId: number }> {
    const [admin] = await t.db.select().from(accounts).where(eq(accounts.phone, '13700000002'))
    const base = { createdBy: admin?.id ?? null, targetType: 'orders', actorLabel: '李敏' }
    const [sales] = await t.db
      .insert(operationLogs)
      .values({ ...base, module: 'sales', kind: '订单', action: '确认订单', targetLabel: 'SO-1' })
      .returning()
    const [pub] = await t.db
      .insert(operationLogs)
      .values({ ...base, module: null, kind: '账号', action: '新增员工', targetLabel: '孙悦' })
      .returning()
    return { salesId: sales?.id ?? 0, publicId: pub?.id ?? 0 }
  }

  test('管理员看全部（含公共），员工只看自己模块', async () => {
    const { publicId } = await seedLogs()
    const all = (await get(await t.bind('u1'), '/logs')).body.data as Page<LogItem>
    expect(all.items.map((item) => item.module)).toEqual([null, 'sales'])
    const li = await t.bind('u2')
    const own = (await get(li, '/logs')).body.data as Page<LogItem>
    expect(own.items.map((item) => item.action)).toEqual(['确认订单'])
    expect((await get(li, '/logs?module=finance')).body.data).toMatchObject({ items: [] })
    expect((await get(li, `/logs/${publicId}`)).status).toBe(404)
  })

  test('日志详情带原因和修改前后', async () => {
    const { salesId } = await seedLogs()
    const detail = (await get(await t.bind('u2'), `/logs/${salesId}`)).body.data as LogDetail
    expect(detail).toMatchObject({ action: '确认订单', reason: '', before: null, after: null })
  })

  test('日期填反 → 两个日期都标红', async () => {
    const res = await get(await t.bind('u1'), '/logs?from=2026-10-02&to=2026-10-01')
    expect(res.status).toBe(422)
    expect(res.body.error?.fields).toEqual({
      from: '结束日期不能早于开始日期',
      to: '结束日期不能早于开始日期',
    })
  })

  test('游标翻页', async () => {
    await seedLogs()
    const admin = await t.bind('u1')
    const first = (await get(admin, '/logs?limit=1')).body.data as Page<LogItem>
    expect(first.items).toHaveLength(1)
    const cursor = encodeURIComponent(first.nextCursor ?? '')
    const second = (await get(admin, `/logs?limit=1&cursor=${cursor}`)).body.data as Page<LogItem>
    expect(second.items[0]?.action).toBe('确认订单')
    expect(second.nextCursor).toBeNull()
  })
})

describe('库存查询', () => {
  test('全部花材按编码升序，停用的也列', async () => {
    await t.db.update(materials).set({ enabled: false }).where(eq(materials.code, 'HC-0003'))
    const li = await t.bind('u2')
    const page = (await get(li, contract.listInventory.path)).body.data as Page<InventoryItem>
    expect(page.items.map((item) => [item.code, item.stockQty])).toEqual([
      ['HC-0001', 228],
      ['HC-0002', 146],
      ['HC-0003', 60],
      ['HC-0004', 95],
      ['HC-0005', 86],
    ])
    expect(page.items[2]).toMatchObject({ name: '向日葵', enabled: false, categoryName: '主花' })
  })

  test('按分类筛、按编码搜', async () => {
    const li = await t.bind('u2')
    const categories = (await get(li, contract.listMaterialCategories.path)).body.data as Page<{
      id: string
      name: string
    }>
    expect(categories.items.map((c) => c.name)).toEqual(['玫瑰', '主花', '配花', '叶材'])
    const rose = categories.items[0]?.id ?? ''
    const byCategory = (await get(li, `/inventory?categoryId=${rose}`)).body
      .data as Page<InventoryItem>
    expect(byCategory.items).toHaveLength(2)
    const byCode = (await get(li, '/inventory?q=HC-0005')).body.data as Page<InventoryItem>
    expect(byCode.items.map((item) => [item.name, item.stockQty])).toEqual([['尤加利', 86]])
  })

  test('仓库员工也能读，门店 → FORBIDDEN', async () => {
    expect((await get(await t.bind('u5'), '/inventory')).status).toBe(200)
    expect((await get(await t.bind('s1'), '/inventory')).status).toBe(403)
  })
})

describe('门店目录', () => {
  test('G28 客户停用时有提示，启用后没有', async () => {
    const openid = await t.bind('s1')
    const [c1] = await t.db.select().from(customers).where(eq(customers.name, '晨曦花艺'))
    const customerId = String(c1?.id)
    // 晨曦花艺目录：粉玫瑰、白绿清新、白绿桌花可订，向日葵停用；customerId 给门店订阅 catalog、ar
    expect((await get(openid, '/store/catalog')).body.data).toMatchObject({
      customerId,
      customerName: '晨曦花艺',
      storeName: '滨江店',
      lockedReason: null,
    })
    await t.db.update(customers).set({ enabled: false }).where(eq(customers.name, '晨曦花艺'))
    expect((await get(openid, '/store/catalog')).body.data).toMatchObject({
      customerId,
      customerName: '晨曦花艺',
      storeName: '滨江店',
      lockedReason: '这个客户已停用，不能再下新单，请联系花众',
    })
    await t.db.update(customers).set({ enabled: true }).where(eq(customers.name, '晨曦花艺'))
    expect((await get(openid, '/store/catalog')).body.data).toMatchObject({ lockedReason: null })
  })
})
