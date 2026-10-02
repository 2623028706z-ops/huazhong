import { type PoDetail, type InviteDetail, type ServerMessage } from '@huazhong/shared'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { inviteOf, poInput, poOf, receiveInput } from './support/purchase.ts'
import { dataOf, startSales, type SalesApp } from './support/sales.ts'
import { connect } from './support/ws.ts'

let s: SalesApp
beforeEach(async () => {
  s = await startSales()
})
afterEach(async () => {
  await s.close()
})
const isPo = (m: ServerMessage) => m.op === 'changed' && m.topic.startsWith('po:')
const isInvite = (m: ServerMessage) => m.op === 'changed' && m.topic.startsWith('invite:')

test('H02 H04 收货页改单、取消、收货推送关联邀请和财务', async () => {
  const purchase = await s.as('u4'),
    wh = await s.as('u5'),
    po = await poOf(s, 'PO-260929-006')
  const warehouseWs = await connect(s.t, wh.openid),
    purchaseWs = await connect(s.t, purchase.openid)
  warehouseWs.send({ op: 'subscribe', topics: [`po:${po.id}`] })
  purchaseWs.send({ op: 'subscribe', topics: [`invite:${po.inviteId}`] })
  await warehouseWs.sync()
  await purchaseWs.sync()
  const edited = dataOf<PoDetail>(
    await purchase.put(`/purchase-orders/${po.id}`, {
      ...poInput(po),
      note: '备注更新',
      reason: '供应商补充',
    }),
  )
  expect(await warehouseWs.next(isPo)).toEqual({
    op: 'changed',
    topic: `po:${po.id}`,
    version: edited.version,
  })
  expect(await purchaseWs.next(isInvite)).toMatchObject({ topic: `invite:${po.inviteId}` })
  dataOf(await wh.post(`/purchase-orders/${po.id}/receive`, receiveInput(edited)))
  expect(await purchaseWs.next(isInvite)).toMatchObject({ topic: `invite:${po.inviteId}` })
  warehouseWs.close()
  purchaseWs.close()
})
test('H05 I01 供应商邀请推送及改邀请版本，别家只收到自己主题', async () => {
  const purchase = await s.as('u4'),
    invite = await inviteOf(s)
  const own = await connect(s.t, (await s.as('p1')).openid),
    other = await connect(s.t, (await s.as('p2')).openid)
  own.send({ op: 'subscribe', topics: [`invite:${invite.id}`, `supplier:${invite.supplierId}`] })
  other.send({ op: 'subscribe', topics: [`invite:${invite.id}`] })
  await own.sync()
  await other.sync()
  const changed = dataOf<InviteDetail>(
    await purchase.put(`/invites/${invite.id}`, {
      version: invite.version,
      lines: invite.lines.map((line) => ({ materialId: line.materialId, needQty: 70 })),
    }),
  )
  expect(await own.next(isInvite)).toEqual({
    op: 'changed',
    topic: `invite:${invite.id}`,
    version: changed.version,
  })
  const sentinel = await poOf(s)
  other.send({ op: 'subscribe', topics: [`po:${sentinel.id}`] })
  await other.sync()
  dataOf(
    await purchase.post(`/purchase-orders/${sentinel.id}/cancel`, {
      version: sentinel.version,
      reason: '取消',
    }),
  )
  expect(await other.next((m) => m.op === 'changed')).toMatchObject({ topic: `po:${sentinel.id}` })
  own.close()
  other.close()
})
