import {
  contract,
  type Catalog,
  copy,
  type Material,
  type PoDetail,
  type WhDocDetail,
  type OutputOf,
} from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { operationLogs, stockMoves, stocktakeLines } from '../db/schema/index.ts'
import { found } from '../src/common/scope.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import { createPo, receiveInput } from './support/purchase.ts'
import { stockQtyOf, whDocOf } from './support/warehouse.ts'

let sales: SalesApp
beforeEach(async () => {
  sales = await startSales()
})
afterEach(async () => {
  await sales.close()
})

async function freshMaterial() {
  return dataOf<Material>(
    await (
      await sales.as('u5')
    ).post('/materials', {
      code: '',
      name: '库存规则新花材',
      unit: '枝',
      enabled: true,
      categoryId: await idBy(sales.t, 'material_categories.name', '玫瑰'),
    }),
  )
}
function editMaterial(row: Material, changes: Partial<Material> = {}) {
  return {
    version: row.version,
    code: row.code,
    name: row.name,
    unit: row.unit,
    enabled: row.enabled,
    categoryId: row.categoryId,
    ...changes,
  }
}
async function countCategory(categoryId: string, actual?: { materialId: string; qty: number }) {
  const warehouse = await sales.as('u5')
  const draft = contract.getStocktakeDraft.response.parse(
    dataOf(await warehouse.get(`/stocktakes/draft?categoryIds=${categoryId}`)),
  )
  return warehouse.post('/stocktakes', {
    categoryIds: [categoryId],
    reason: '实物复核',
    lines: draft.lines.map((line) => ({
      materialId: line.materialId,
      bookQty: line.bookQty,
      actualQty: line.materialId === actual?.materialId ? actual.qty : line.bookQty,
    })),
  })
}
async function categoryOf(materialId: string) {
  return dataOf<Material>(await (await sales.as('u5')).get(`/materials/${materialId}`)).categoryId
}
async function records() {
  return {
    logs: await sales.t.db.select().from(operationLogs),
    moves: await sales.t.db.select().from(stockMoves),
  }
}

test('未使用花材可改单位；已有库存的花材不能改单位但能改名和停用，失败不写日志', async () => {
  const warehouse = await sales.as('u5')
  const fresh = await freshMaterial()
  expect(
    dataOf<Material>(
      await warehouse.patch(`/materials/${fresh.id}`, editMaterial(fresh, { unit: '束' })),
    ).unit,
  ).toBe('束')
  const materialId = await idBy(sales.t, 'materials.name', '向日葵')
  const before = dataOf<Material>(await warehouse.get(`/materials/${materialId}`))
  const snapshot = await records()
  const qty = await stockQtyOf(sales, materialId)
  expect(
    await warehouse.patch(`/materials/${materialId}`, editMaterial(before, { unit: '束' })),
  ).toMatchObject({
    status: 409,
    body: { error: { code: 'BUSINESS_RULE', message: copy.stock.unitInUse } },
  })
  expect(await records()).toEqual(snapshot)
  expect(await stockQtyOf(sales, materialId)).toBe(qty)
  expect(
    dataOf<Material>(
      await warehouse.patch(
        `/materials/${materialId}`,
        editMaterial(before, { name: '向日葵新名', enabled: false }),
      ),
    ),
  ).toMatchObject({ unit: '枝', enabled: false, name: '向日葵新名' })
})

test.each(['po', 'invite', 'bom', 'stocktake', 'history'] as const)(
  '只有 %s 引用或历史、库存为零的花材也不能改单位',
  async (kind) => {
    const warehouse = await sales.as('u5')
    const row = await freshMaterial()
    if (kind === 'po')
      await createPo(sales, { lines: [{ materialId: row.id, qty: 1, priceCents: 100 }] })
    if (kind === 'invite')
      dataOf(
        await (
          await sales.as('u4')
        ).post('/invites', {
          supplierId: await idBy(sales.t, 'suppliers.name', '春禾花材'),
          lines: [{ materialId: row.id, needQty: 1 }],
        }),
      )
    if (kind === 'bom') {
      const seller = await sales.as('u2')
      const c1 = await idBy(sales.t, 'customers.name', '晨曦花艺')
      const catalog = dataOf<Catalog>(await seller.get(`/catalog/${c1}`))
      dataOf(
        await seller.post(`/catalog/${c1}/items`, {
          name: '库存规则产品',
          unit: '束',
          imageFileId: null,
          categoryId: found(catalog.categories[0]).id,
          customerCode: '',
          priceCents: 1000,
          enabled: true,
          bom: [{ materialId: row.id, qty: 1 }],
        }),
      )
    }
    if (kind === 'stocktake') dataOf(await countCategory(row.categoryId))
    if (kind === 'history') {
      const incoming = dataOf<WhDocDetail>(
        await warehouse.post('/warehouse/docs', {
          kind: 'in',
          supplierId: await idBy(sales.t, 'suppliers.name', '春禾花材'),
          reason: '',
          lines: [{ materialId: row.id, qty: 1, priceCents: 0 }],
        }),
      )
      dataOf(
        await warehouse.post(`/warehouse/docs/${incoming.id}/void`, {
          version: incoming.version,
          reason: '误录',
        }),
      )
    }
    expect(await stockQtyOf(sales, row.id)).toBe(0)
    expect(
      await warehouse.patch(`/materials/${row.id}`, editMaterial(row, { unit: '束' })),
    ).toMatchObject({ status: 409, body: { error: { message: copy.stock.unitInUse } } })
  },
)

test('误记出库后盘点恢复实物数，再作废旧单被拦，不会从60变70且整笔无写入', async () => {
  const warehouse = await sales.as('u5')
  const outgoing = await whDocOf(sales, 'out', 10)
  const materialId = found(outgoing.lines[0]).materialId
  expect(await stockQtyOf(sales, materialId)).toBe(50)
  dataOf(await countCategory(await categoryOf(materialId), { materialId, qty: 60 }))
  const before = await records()
  const detail = dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${outgoing.id}`))
  expect(detail.actions.find((action) => action.code === 'void')).toMatchObject({
    enabled: false,
    disabledReason: copy.stock.voidAfterStocktake,
  })
  expect(
    await warehouse.post(`/warehouse/docs/${outgoing.id}/void`, {
      version: outgoing.version,
      reason: '误领',
    }),
  ).toMatchObject({ status: 409, body: { error: { message: copy.stock.voidAfterStocktake } } })
  expect(await stockQtyOf(sales, materialId)).toBe(60)
  expect(await records()).toEqual(before)
  expect(dataOf<WhDocDetail>(await warehouse.get(`/warehouse/docs/${outgoing.id}`))).toMatchObject({
    status: 'stocked_out',
    version: outgoing.version,
  })
})

test.each(['in', 'out', 'loss'] as const)(
  '无差异盘点也拦旧%s单；列表和详情一致，盘点后的新单仍可作废',
  async (kind) => {
    const warehouse = await sales.as('u5')
    const old = await whDocOf(sales, kind)
    const materialId = found(old.lines[0]).materialId
    const count = contract.getStocktake.response.parse(
      dataOf(await countCategory(await categoryOf(materialId))),
    )
    expect(count.diffCount).toBe(0)
    const checkpoints = await sales.t.db
      .select()
      .from(stocktakeLines)
      .where(eq(stocktakeLines.stocktakeId, Number(count.id)))
    expect(
      found(checkpoints.find((row) => row.materialId === Number(materialId))).lastMoveId,
    ).toBeGreaterThan(0)
    const list = dataOf<OutputOf<typeof contract.listWhDocs>>(
      await warehouse.get(`/warehouse/docs?kind=${kind}`),
    )
    expect(
      found(list.items.find((row) => row.id === old.id)).actions.find(
        (action) => action.code === 'void',
      )?.enabled,
    ).toBe(false)
    expect(
      (
        await warehouse.post(`/warehouse/docs/${old.id}/void`, {
          version: old.version,
          reason: '误录',
        })
      ).status,
    ).toBe(409)
    const fresh = await whDocOf(sales, kind)
    expect(
      (
        await warehouse.post(`/warehouse/docs/${fresh.id}/void`, {
          version: fresh.version,
          reason: '误录',
        })
      ).status,
    ).toBe(200)
    if (kind === 'in')
      expect(
        (
          await warehouse.post(`/warehouse/docs/${old.id}/reprice`, {
            version: old.version,
            reason: '改价不改库存',
            lines: [{ lineId: found(old.lines[0]).id, priceCents: 300 }],
          })
        ).status,
      ).toBe(200)
  },
)

test('盘点另一分类不阻挡旧单作废', async () => {
  const outgoing = await whDocOf(sales, 'out')
  dataOf(await countCategory(await idBy(sales.t, 'material_categories.name', '玫瑰')))
  expect(
    (
      await (
        await sales.as('u5')
      ).post(`/warehouse/docs/${outgoing.id}/void`, {
        version: outgoing.version,
        reason: '误领',
      })
    ).status,
  ).toBe(200)
})

test('盘点阻挡采购收货作废，但允许实际退货、改价；盘点后的收货可作废，即使下单更早', async () => {
  const warehouse = await sales.as('u5')
  const old = await createPo(sales)
  const fresh = await createPo(sales)
  const received = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${old.id}/receive`, receiveInput(old)),
  )
  dataOf(await countCategory(await categoryOf(found(old.lines[0]).materialId)))
  const detail = dataOf<PoDetail>(await warehouse.get(`/purchase-orders/${old.id}`))
  expect(detail.actions.find((action) => action.code === 'voidPo')).toMatchObject({
    enabled: false,
    disabledReason: copy.stock.voidAfterStocktake,
  })
  const list = dataOf<OutputOf<typeof contract.listPurchaseOrders>>(
    await warehouse.get('/purchase-orders'),
  )
  expect(
    found(list.items.find((row) => row.id === old.id)).actions.find(
      (action) => action.code === 'voidPo',
    )?.enabled,
  ).toBe(false)
  expect(
    (
      await warehouse.post(`/purchase-orders/${old.id}/void`, {
        version: received.version,
        reason: '误录',
      })
    ).status,
  ).toBe(409)
  const repriced = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${old.id}/reprice`, {
      version: received.version,
      reason: '议价',
      lines: [{ poLineId: found(received.lines[0]).id, priceCents: 100 }],
    }),
  )
  expect(
    (
      await warehouse.post(`/purchase-orders/${old.id}/returns`, {
        version: repriced.version,
        lines: [{ poLineId: found(repriced.lines[0]).id, qty: 1 }],
      })
    ).status,
  ).toBe(200)
  const after = dataOf<PoDetail>(
    await warehouse.post(`/purchase-orders/${fresh.id}/receive`, receiveInput(fresh)),
  )
  expect(
    (
      await warehouse.post(`/purchase-orders/${fresh.id}/void`, {
        version: after.version,
        reason: '误录',
      })
    ).status,
  ).toBe(200)
})
