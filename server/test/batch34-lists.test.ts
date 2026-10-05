// 2026-10-06 体验改版第 3、4 批：往来排序筛选、花材管理权限、供应商搜索（从 batch34 拆出）
import type { contract, OutputOf } from '@huazhong/shared'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { codesOf, dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

describe('财务往来', () => {
  type Parties = OutputOf<typeof contract.listArCustomers>
  const segment = (row: Parties['items'][number]) =>
    row.overdueCents > 0 ? 0 : row.outstandingCents > 0 ? 1 : 2
  test.each(['customers', 'suppliers'])(
    '%s：逾期在前 → 未收大到小 → 没欠款；页签数字',
    async (kind) => {
      const finance = await s.as('u6')
      const all = dataOf<Parties>(await finance.get(`/finance/${kind}?limit=50`))
      const segments = all.items.map(segment)
      expect([...segments].sort()).toEqual(segments)
      for (const seg of [0, 1]) {
        const amounts = all.items
          .filter((row) => segment(row) === seg)
          .map((r) => r.outstandingCents)
        expect([...amounts].sort((a, b) => b - a)).toEqual(amounts)
      }
      for (const filter of ['outstanding', 'overdue', 'unstatemented'] as const) {
        const page = dataOf<Parties>(
          await finance.get(`/finance/${kind}?limit=50&filter=${filter}`),
        )
        expect(page.counts[filter]).toBe(page.items.length)
        expect(page.counts).toEqual(all.counts)
      }
      const paged: string[] = []
      let cursor: string | null = null
      do {
        const query: string = cursor === null ? '' : `&cursor=${cursor}`
        const page: Parties = dataOf(await finance.get(`/finance/${kind}?limit=1${query}`))
        paged.push(...page.items.map((row) => row.partyId))
        cursor = page.nextCursor
      } while (cursor !== null)
      expect(paged).toEqual(all.items.map((row) => row.partyId))
    },
  )
})

describe('花材管理权限', () => {
  test('仓库、采购、管理员能新建花材和管理分类；销售、财务不能', async () => {
    const categoryId = await idBy(s.t, 'material_categories.name', '玫瑰')
    const input = (name: string) => ({ code: '', name, categoryId, unit: '枝', enabled: true })
    for (const key of ['u4', 'u5', 'u1'] as const) {
      const api = await s.as(key)
      expect((await api.post('/materials', input(`白玫瑰${key}`))).status).toBe(200)
      expect((await api.post('/material-categories', { name: `分类${key}`, sort: 9 })).status).toBe(
        200,
      )
      const inventory = dataOf<OutputOf<typeof contract.listInventory>>(await api.get('/inventory'))
      expect(codesOf(inventory.actions)).toEqual(['create', 'manageCategories'])
    }
    for (const key of ['u2', 'u6'] as const) {
      const api = await s.as(key)
      expect((await api.post('/materials', input(`黄玫瑰${key}`))).status).toBe(403)
      expect((await api.post('/material-categories', { name: `分类${key}`, sort: 9 })).status).toBe(
        403,
      )
      const inventory = dataOf<OutputOf<typeof contract.listInventory>>(await api.get('/inventory'))
      expect(inventory.actions).toEqual([])
    }
    const purchaseList = dataOf<OutputOf<typeof contract.listMaterials>>(
      await (await s.as('u4')).get('/materials'),
    )
    expect(codesOf(purchaseList.actions)).toEqual(['create', 'manageCategories'])
  })
})

test('供应商列表按名称、联系人搜索', async () => {
  const purchase = await s.as('u4')
  const search = async (q: string) =>
    dataOf<OutputOf<typeof contract.listSuppliers>>(
      await purchase.get(`/suppliers?q=${encodeURIComponent(q)}`),
    ).items.map((row) => row.name)
  expect(await search('杨女士')).toEqual(['云岭花卉'])
  expect(await search('春禾')).toEqual(['春禾花材'])
})
