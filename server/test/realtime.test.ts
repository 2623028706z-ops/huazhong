// 实时推送：握手认身份、订阅按权限、推送按 scope 过滤、账号变更断开、LISTEN 断线重连（05 章第 12 节）
import { WS_CLOSE, type ServerMessage } from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { accounts, customers, stores } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { FixtureModule } from './support/fixtures.ts'
import { call } from './support/http.ts'
import { connect } from './support/ws.ts'

let t: TestApp
let admin: string
beforeEach(async () => {
  t = await startApp({ imports: [FixtureModule] })
  admin = await t.bind('u1')
})
afterEach(async () => {
  await t.close()
})

async function idOf(table: typeof stores | typeof customers, name: string): Promise<string> {
  const [row] = await t.db.select({ id: table.id }).from(table).where(eq(table.name, name))
  return String(row?.id)
}

const notify = (body: {
  topic: string
  version?: number
  storeIds?: string[]
  supplierIds?: string[]
}) => call(t, 'POST', '/test/notify', { openid: admin, body })

const changed = (m: ServerMessage) => m.op === 'changed'

test('没带 openid → 握手后关闭 4401；账号停用 → 4403', async () => {
  expect(await (await connect(t)).closed).toBe(WS_CLOSE.unauthenticated)
  const openid = await t.bind('u2')
  await t.db.update(accounts).set({ enabled: false }).where(eq(accounts.phone, '13700000002'))
  expect(await (await connect(t, openid)).closed).toBe(WS_CLOSE.accountDisabled)
})

test('门店只收本店相关的订单推送', async () => {
  const ws = await connect(t, await t.bind('s1'))
  ws.send({ op: 'subscribe', topics: ['orders'] })
  await ws.sync()
  await notify({ topic: 'orders', version: 1, storeIds: [await idOf(stores, '城西店')] })
  await notify({ topic: 'orders', version: 2, storeIds: [await idOf(stores, '滨江店')] })
  expect(await ws.next(changed)).toEqual({ op: 'changed', topic: 'orders', version: 2 })
  ws.close()
})

test('订阅别的客户的订货目录被忽略', async () => {
  const ws = await connect(t, await t.bind('s1'))
  const own = await idOf(customers, '晨曦花艺')
  const other = await idOf(customers, '拾光花店')
  ws.send({ op: 'subscribe', topics: [`catalog:${other}`, `catalog:${own}`] })
  await ws.sync()
  await notify({ topic: `catalog:${other}` })
  await notify({ topic: `catalog:${own}` })
  expect(await ws.next(changed)).toMatchObject({ topic: `catalog:${own}` })
  ws.close()
})

test('通配订阅 todo:* 只收自己模块的待办', async () => {
  const ws = await connect(t, await t.bind('u7'))
  ws.send({ op: 'subscribe', topics: ['todo:*'] })
  await ws.sync()
  await notify({ topic: 'todo:sales' })
  await notify({ topic: 'todo:shipping' })
  expect(await ws.next(changed)).toEqual({ op: 'changed', topic: 'todo:shipping', version: null })
  ws.close()
})

test('账号被停用：它的连接关闭 4403', async () => {
  const openid = await t.bind('u2')
  const [target] = await t.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.phone, '13700000002'))
  const ws = await connect(t, openid)
  ws.send({ op: 'subscribe', topics: [`account:${String(target?.id)}`] })
  await ws.sync()
  await call(t, 'POST', `/test/accounts/${String(target?.id)}/disable`, { openid: admin })
  expect(await ws.closed).toBe(WS_CLOSE.accountDisabled)
})

test('LISTEN 连接断了：自动重连，给所有连接发 resync，之后照常推送', async () => {
  const ws = await connect(t, await t.bind('u2'))
  ws.send({ op: 'subscribe', topics: ['orders'] })
  await ws.sync()
  await t.db.execute(sql`
    SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = current_database() AND query LIKE 'LISTEN%' AND pid <> pg_backend_pid()`)
  expect(await ws.next((m) => m.op === 'resync')).toEqual({ op: 'resync' })
  await notify({ topic: 'orders', version: 7 })
  expect(await ws.next(changed)).toMatchObject({ topic: 'orders', version: 7 })
  ws.close()
})
