import { randomUUID } from 'node:crypto'
import type { InviteDetail, PoDetail, contract, OutputOf } from '@huazhong/shared'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { materials } from '../db/schema/index.ts'
import { call } from './support/http.ts'
import { inviteOf, receiveInput } from './support/purchase.ts'
import { dataOf, idBy, startSales, type SalesApp } from './support/sales.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})

test('B25 发出邀请校验、账号筛选、日期和采购员', async () => {
  const api = await s.as('u4')
  const suppliers = dataOf<OutputOf<typeof contract.listSuppliers>>(
    await api.get('/suppliers?enabled=true&hasAccount=true'),
  )
  expect(suppliers.items.map((row) => row.name).sort()).toEqual(['云岭花卉', '春禾花材'])
  const supplierId = await idBy(s.t, 'suppliers.name', '云岭花卉')
  const materialId = await idBy(s.t, 'materials.name', '向日葵')
  expect(
    (await api.post('/invites', { supplierId, lines: [{ materialId, needQty: 0 }] })).body.error
      ?.fields?.['lines.0.needQty'],
  ).toBe('需求量须为大于 0 的整数')
  const invite = dataOf<InviteDetail>(
    await api.post('/invites', { supplierId, lines: [{ materialId, needQty: 15 }] }),
  )
  expect(invite).toMatchObject({ status: 'pending', buyerName: '周宁', lines: [{ needQty: 15 }] })
  expect(invite.no).toMatch(/^YQ-/)
  expect(invite).not.toHaveProperty('expectedDate')
  const noAccount = await api.post('/invites', {
    supplierId: await idBy(s.t, 'suppliers.name', '滇花源'),
    lines: [{ materialId, needQty: 15 }],
  })
  expect(noAccount.body.error?.message).toBe('这家供应商还没有开通供应商端账号')
})
test('B19 F02 别家的邀请不可读写、不能全部不供', async () => {
  const invite = await inviteOf(s),
    other = await s.as('p2'),
    own = await s.as('p1')
  expect((await other.get(`/supplier/invites/${invite.id}`)).status).toBe(404)
  const supply = {
    version: invite.version,
    lines: [{ materialId: invite.lines[0]?.materialId, qty: 60, priceCents: 350 }],
  }
  expect((await other.post(`/supplier/invites/${invite.id}/submit`, supply)).status).toBe(404)
  expect(
    (await own.post(`/supplier/invites/${invite.id}/submit`, { ...supply, lines: [] })).body.error
      ?.message,
  ).toBe('请至少保留一种花材；全部不供请联系采购取消邀请')
  expect((await inviteOf(s)).status).toBe('pending')
})
test('B27 B28 B29 填报生成采购单、快照、幂等及收货改价', async () => {
  const invite = await inviteOf(s),
    api = await s.as('p1'),
    wh = await s.as('u5')
  const base = { materialId: invite.lines[0]?.materialId, qty: 70, priceCents: 350 }
  expect(
    (
      await api.post(`/supplier/invites/${invite.id}/submit`, {
        version: invite.version,
        lines: [{ ...base, qty: 0 }],
      })
    ).body.error?.fields?.['lines.0.qty'],
  ).toBe('供货量须为大于 0 的整数，不供的花材请删掉这一行')
  const missing = { materialId: base.materialId, qty: base.qty }
  expect(
    (
      await api.post(`/supplier/invites/${invite.id}/submit`, {
        version: invite.version,
        lines: [missing],
      })
    ).body.error?.fields?.['lines.0.priceCents'],
  ).toBe('请填写单价，赠送的花材填 0')
  const options = {
    openid: api.openid,
    idempotencyKey: randomUUID(),
    body: { version: invite.version, lines: [base] },
  }
  const path = `/supplier/invites/${invite.id}/submit`
  const result = dataOf<OutputOf<typeof contract.submitSupplierInvite>>(
    await call(s.t, 'POST', path, options),
  )
  expect(dataOf(await call(s.t, 'POST', path, options))).toEqual(result)
  expect(result.purchaseOrder).toMatchObject({
    supplierName: '春禾花材',
    buyerName: '周宁',
    status: 'to_receive',
    amountCents: 24500,
    inviteId: invite.id,
  })
  expect(result.invite).toMatchObject({
    status: 'submitted',
    actions: [],
    purchaseOrderId: result.purchaseOrder.id,
    supply: [{ qty: 70, priceCents: 350 }],
  })
  expect(
    dataOf<OutputOf<typeof contract.supplierPurchaseOrders>>(
      await api.get('/supplier/purchase-orders'),
    ).items,
  ).toHaveLength(2)
  const body = receiveInput(result.purchaseOrder)
  body.lines = body.lines.map((line) => ({ ...line, priceCents: 320 }))
  expect(
    (await wh.post(`/purchase-orders/${result.purchaseOrder.id}/receive`, body)).body.error?.fields,
  ).toEqual({ reason: '改了单价，请填写改价原因' })
  const received = dataOf<PoDetail>(
    await wh.post(`/purchase-orders/${result.purchaseOrder.id}/receive`, {
      ...body,
      reason: '供应商让价',
    }),
  )
  expect(received).toMatchObject({
    status: 'received',
    repriced: true,
    payableCents: 22400,
    lines: [{ orderPriceCents: 350, priceCents: 320 }],
    priceChanges: [{ reason: '供应商让价' }],
  })
  expect((await inviteOf(s)).supply[0]?.priceCents).toBe(350)
})
test('B31 提交含停用邀请行或另报行拒绝，供应商删行即能提交且原需求保留', async () => {
  const invite = await inviteOf(s),
    supplier = await s.as('p1')
  const materialId = invite.lines[0]?.materialId
  await s.t.db
    .update(materials)
    .set({ enabled: false })
    .where(eq(materials.id, Number(materialId)))
  expect(
    dataOf<InviteDetail>(await supplier.get(`/supplier/invites/${invite.id}`)).lines[0]?.enabled,
  ).toBe(false)
  const otherId = await idBy(s.t, 'materials.name', '尤加利')
  const supply = {
    version: invite.version,
    lines: [{ materialId: otherId, qty: 10, priceCents: 200 }],
  }
  expect(
    (
      await supplier.post(`/supplier/invites/${invite.id}/submit`, {
        ...supply,
        lines: [...supply.lines, { materialId, qty: 60, priceCents: 350 }],
      })
    ).body.error,
  ).toMatchObject({ code: 'BUSINESS_RULE', message: '花材已停用，请删掉这一行再提交' })
  const extraId = await idBy(s.t, 'materials.name', '白玫瑰')
  await s.t.db
    .update(materials)
    .set({ enabled: false })
    .where(eq(materials.id, Number(extraId)))
  expect(
    (
      await supplier.post(`/supplier/invites/${invite.id}/submit`, {
        ...supply,
        lines: [...supply.lines, { materialId: extraId, qty: 1, priceCents: 200 }],
      })
    ).body.error,
  ).toMatchObject({ code: 'BUSINESS_RULE', message: '花材已停用，请删掉这一行再提交' })
  const enabled = dataOf<OutputOf<typeof contract.supplierMaterials>>(
    await supplier.get('/supplier/materials'),
  )
  expect(enabled.items.map((row) => row.id)).not.toContain(materialId)
  const submitted = dataOf<OutputOf<typeof contract.submitSupplierInvite>>(
    await supplier.post(`/supplier/invites/${invite.id}/submit`, supply),
  )
  expect(submitted.invite.lines).toEqual(invite.lines.map((line) => ({ ...line, enabled: false })))
  expect(submitted.invite.supply).toMatchObject([{ materialId: otherId, qty: 10 }])
  expect(submitted.purchaseOrder.lines).toMatchObject([{ materialId: otherId, qty: 10 }])
})
test('B32 J24 分享卡片签名、归属和失效', async () => {
  const invite = await inviteOf(s),
    purchase = await s.as('u4'),
    supplier = await s.as('p1')
  const share = dataOf<OutputOf<typeof contract.shareInvite>>(
    await purchase.post(`/invites/${invite.id}/share`),
  )
  const params = new URL(share.path, 'https://x.invalid').searchParams
  expect(params.get('t')).toBe('invite')
  expect(share.title).toBe('花众采购邀请你填报供货')
  const body = { id: params.get('id'), sig: params.get('sig') }
  expect(dataOf(await supplier.post('/supplier/invites/resolve', body))).toEqual({
    inviteId: invite.id,
  })
  expect(
    (await (await s.as('p2')).post('/supplier/invites/resolve', body)).body.error,
  ).toMatchObject({ code: 'FORBIDDEN', message: '这张邀请不是发给你的' })
  expect(
    (await supplier.post('/supplier/invites/resolve', { ...body, sig: 'wrong' })).body.error?.code,
  ).toBe('BUSINESS_RULE')
  dataOf(await purchase.post(`/invites/${invite.id}/cancel`, { version: invite.version }))
  expect((await supplier.post('/supplier/invites/resolve', body)).body.error?.message).toBe(
    '这次邀请已提交或已取消，链接已失效',
  )
})
test('I01 修改邀请、无修改报错、旧版本提交和取消互斥', async () => {
  const invite = await inviteOf(s),
    purchase = await s.as('u4'),
    supplier = await s.as('p1')
  const body = {
    version: invite.version,
    lines: invite.lines.map((line) => ({ materialId: line.materialId, needQty: line.needQty })),
  }
  expect((await purchase.put(`/invites/${invite.id}`, body)).body.error?.message).toBe(
    '没有修改内容',
  )
  const changed = dataOf<InviteDetail>(
    await purchase.put(`/invites/${invite.id}`, {
      ...body,
      lines: body.lines.map((line) => ({ ...line, needQty: 70 })),
    }),
  )
  const supply = {
    version: invite.version,
    lines: [{ materialId: invite.lines[0]?.materialId, qty: 60, priceCents: 350 }],
  }
  expect(
    (await supplier.post(`/supplier/invites/${invite.id}/submit`, supply)).body.error,
  ).toMatchObject({ code: 'STALE', latest: { version: changed.version } })
  const results = await Promise.all([
    purchase.post(`/invites/${invite.id}/cancel`, { version: changed.version }),
    supplier.post(`/supplier/invites/${invite.id}/submit`, { ...supply, version: changed.version }),
  ])
  expect(results.map((res) => res.status).sort()).toEqual([200, 409])
})
