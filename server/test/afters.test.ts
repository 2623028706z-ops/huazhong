// 售后：申请、新建、处理、关闭、作废、申请期限（07 章 A01–A05、A21、A35、A37、J26、J29）
import { copy, type AfterDetail, type OrderDetail } from '@huazhong/shared'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { operationLogs } from '../db/schema/index.ts'
import { codesOf, dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'
import { uploadAfterImage } from './support/images.ts'

let s: SalesApp
let o021: string
beforeEach(async () => {
  s = await startSales()
  o021 = await idBy(s.t, 'orders.no', 'SO-260927-021')
})
afterEach(async () => {
  await s.close()
})

const order = async (key: 'u2' | 's1' = 'u2') =>
  dataOf<OrderDetail>(await (await s.as(key)).get(`/orders/${o021}`))
const roseLine = async () => (await order()).lines.find((l) => l.name === '粉玫瑰日常花束')
const roseMax = async () => (await roseLine())?.maxQty

async function storeApply(qty: number, description = '花头折损') {
  const line = await roseLine()
  const store = await s.as('s1')
  const imageFileId = await uploadAfterImage(s, store)
  return store.post('/store/afters', {
    orderId: o021,
    lines: [
      { orderLineId: line?.id, qty, reason: 'damaged', description, imageFileIds: [imageFileId] },
    ],
  })
}

async function salesCreate(qty: number, extra: Record<string, unknown> = {}) {
  const line = await roseLine()
  return (await s.as('u2')).post('/afters', {
    orderId: o021,
    note: '',
    lines: [
      {
        orderLineId: line?.id,
        qty,
        priceCents: 6800,
        reason: 'qty_mismatch',
        description: '',
        ...extra,
      },
    ],
  })
}

describe('可申请数量', () => {
  test('A01 销售新建：累计不超过实发', async () => {
    dataOf(await salesCreate(14))
    const res = await salesCreate(2)
    expect(res.status).toBe(422)
    expect(res.body.error?.fields).toEqual({
      'lines.0.qty': '售后数量不能超过实发数量减去已申请的售后',
    })
    expect(await roseMax()).toBe(1)
  })

  test('A02 待处理的也算进上限；关闭后恢复', async () => {
    dataOf(await storeApply(10))
    expect(await roseMax()).toBe(5)
    const over = await storeApply(6)
    expect(over.body.error?.fields).toEqual({
      'lines.0.qty': '售后数量须大于 0，且不超过实发数量减去已申请的售后',
    })
    const third = dataOf<AfterDetail>(await storeApply(5))
    expect(await roseMax()).toBe(0)
    dataOf(
      await (
        await s.as('u2')
      ).post(`/afters/${third.id}/close`, { version: third.version, reason: '门店撤回' }),
    )
    expect(await roseMax()).toBe(5)
  })

  test('A37 销售新建要选原因，说明选填，requestedQty 为 null', async () => {
    const missing = await salesCreate(1, { reason: undefined })
    expect(missing.body.error?.fields?.['lines.0.reason']).toBe('请选择售后原因')
    const saved = dataOf<AfterDetail>(await salesCreate(1))
    expect(saved).toMatchObject({ status: 'processed', origin: 'sales', amountCents: 6800 })
    expect(saved.lines[0]).toMatchObject({ requestedQty: null, images: [], reason: 'qty_mismatch' })
  })
})

describe('处理和关闭', () => {
  test('A03 门店提交的：全 0 要改关闭；改成 4 后已处理，申请数量保留', async () => {
    const applied = dataOf<AfterDetail>(await storeApply(10))
    const sales = await s.as('u2')
    const lineOf = (qty: number) => [{ id: applied.lines[0]?.id, qty, priceCents: 6800 }]
    const zero = await sales.post(`/afters/${applied.id}/process`, {
      version: applied.version,
      note: '',
      lines: lineOf(0),
    })
    expect(zero.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '数量都是 0，整张不处理请关闭售后并写原因',
    })
    const done = dataOf<AfterDetail>(
      await sales.post(`/afters/${applied.id}/process`, {
        version: applied.version,
        note: '',
        lines: lineOf(4),
      }),
    )
    expect(done).toMatchObject({
      status: 'processed',
      amountCents: 27200,
      notice: '售后金额将计入下一张对账单',
    })
    expect(done.lines[0]).toMatchObject({ requestedQty: 10, qty: 4, description: '花头折损' })
    expect(await roseMax()).toBe(11)
  })

  test('A04 售后单价只能改低', async () => {
    const id = await idBy(s.t, 'afters.no', 'AS-260929-003')
    const sales = await s.as('u2')
    const before = dataOf<AfterDetail>(await sales.get(`/afters/${id}`))
    const lineOf = (priceCents: number) => [{ id: before.lines[0]?.id, qty: 2, priceCents }]
    const high = await sales.post(`/afters/${id}/process`, {
      version: before.version,
      note: '',
      lines: lineOf(8000),
    })
    expect(high.body.error?.fields).toEqual({
      'lines.0.priceCents': '粉玫瑰日常花束的售后单价不能高于发货单价 ¥68.00',
    })
    const done = dataOf<AfterDetail>(
      await sales.post(`/afters/${id}/process`, {
        version: before.version,
        note: '',
        lines: lineOf(6000),
      }),
    )
    expect(done.amountCents).toBe(12000)
  })

  test('J26 门店提交的售后不能增删行', async () => {
    const id = await idBy(s.t, 'afters.no', 'AS-260929-003')
    const sales = await s.as('u2')
    const after = dataOf<AfterDetail>(await sales.get(`/afters/${id}`))
    expect(codesOf(after.actions)).toEqual(['closeAfter', 'processAfter'])
    const lines = [
      { id: after.lines[0]?.id, qty: 2, priceCents: 6800 },
      { id: '999999', qty: 1, priceCents: 6800 },
    ]
    const res = await sales.post(`/afters/${id}/process`, {
      version: after.version,
      note: '',
      lines,
    })
    expect(res.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '门店提交的售后只能改数量和单价',
    })
  })

  test('A05 关闭响应与受控详情返回真实关闭日志时间，不显示金额和操作', async () => {
    const applied = dataOf<AfterDetail>(await storeApply(2))
    expect(applied.closedAt).toBeNull()
    const closed = dataOf<AfterDetail>(
      await (
        await s.as('u2')
      ).post(`/afters/${applied.id}/close`, { version: applied.version, reason: '门店撤回' }),
    )
    const where = and(
      eq(operationLogs.targetType, 'afters'),
      eq(operationLogs.targetId, Number(applied.id)),
      eq(operationLogs.action, copy.log.action.closeAfter),
    )
    const [log] = await s.t.db
      .select({
        createdAt: operationLogs.createdAt,
        module: operationLogs.module,
        kind: operationLogs.kind,
        action: operationLogs.action,
        targetType: operationLogs.targetType,
        targetId: operationLogs.targetId,
        targetLabel: operationLogs.targetLabel,
        actorLabel: operationLogs.actorLabel,
      })
      .from(operationLogs)
      .where(where)
    if (!log) throw new Error('expected close log')
    const closedAt = log.createdAt.toISOString()
    expect(closed).toMatchObject({
      status: 'closed',
      amountCents: null,
      actions: [],
      closeReason: '门店撤回',
      closedAt,
    })
    // 同 id 的其他实体日志、同实体的其他动作不能污染这个时间。
    await s.t.db.insert(operationLogs).values([
      { ...log, targetType: 'orders', createdAt: new Date('2099-01-01') },
      { ...log, action: copy.log.action.voidAfter, createdAt: new Date('2099-01-02') },
    ])
    for (const [key, path] of [
      ['s1', `/afters/${applied.id}`],
      ['u2', `/afters/${applied.id}`],
      ['u6', `/finance/afters/${applied.id}`],
    ] as const) {
      const view = dataOf<AfterDetail>(await (await s.as(key)).get(path))
      expect(view).toMatchObject({ closedAt, amountCents: null, actions: [] })
    }
    await s.t.db.delete(operationLogs).where(where)
    expect(
      dataOf<AfterDetail>(await (await s.as('s1')).get(`/afters/${applied.id}`)).closedAt,
    ).toBeNull()
  })
})

describe('作废和列表', () => {
  test('A21 销售作废：要原因；作废后金额为 null、可申请数量恢复', async () => {
    const created = dataOf<AfterDetail>(await salesCreate(3))
    expect(codesOf(created.actions)).toEqual(['voidAfter'])
    const sales = await s.as('u2')
    const blank = await sales.post(`/afters/${created.id}/void`, {
      version: created.version,
      reason: '',
    })
    expect(blank.body.error?.fields).toEqual({ reason: '请填写作废原因' })
    const voided = dataOf<AfterDetail>(
      await sales.post(`/afters/${created.id}/void`, {
        version: created.version,
        reason: '数量填多了',
      }),
    )
    expect(voided).toMatchObject({
      status: 'voided',
      amountCents: null,
      actions: [],
      voidReason: '数量填多了',
    })
    expect(await roseMax()).toBe(15)
  })

  test('J29 列表级操作码：销售新建、门店与财务没有', async () => {
    expect(
      codesOf(
        dataOf<{ actions: { code: string }[] }>(await (await s.as('u2')).get('/afters')).actions,
      ),
    ).toEqual(['createAfter'])
    expect(
      codesOf(
        dataOf<{ actions: { code: string }[] }>(await (await s.as('s1')).get('/afters')).actions,
      ),
    ).toEqual([])
    expect(dataOf<{ actions: unknown[] }>(await (await s.as('u6')).get('/afters')).actions).toEqual(
      [],
    )
  })

  test('A35 门店申请期限：发货日 + 7 天当天还能申请，过了只能销售新建', async () => {
    s.clock.set('2026-10-05T15:00:00.000Z')
    expect((await order('s1')).actions).toEqual([
      { code: 'applyAfter', enabled: true, disabledReason: null, reasonRequired: null },
    ])
    dataOf(await storeApply(1))
    s.clock.set('2026-10-05T16:00:00.000Z')
    expect((await order('s1')).actions[0]).toMatchObject({
      enabled: false,
      disabledReason: '已超过售后申请时间，请联系花众销售',
    })
    const late = await storeApply(1)
    expect(late.body.error).toMatchObject({
      code: 'BUSINESS_RULE',
      message: '已超过售后申请时间，请联系花众销售',
    })
    dataOf(await salesCreate(1))
  })
})
