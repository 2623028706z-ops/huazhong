// 公共层：权限两层、错误响应、入参校验、幂等、事务、STALE、发号、分页（00 章第 4、6 节；05 章第 1 节）
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, customers, idempotencyKeys, operationLogs, stores } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { TestClock } from './support/clock.ts'
import { FixtureModule } from './support/fixtures.ts'
import { call } from './support/http.ts'

let t: TestApp
const clock = new TestClock(Date.parse('2026-09-30T02:00:00.000Z'))
beforeEach(async () => {
  clock.set('2026-09-30T02:00:00.000Z')
  t = await startApp({ imports: [FixtureModule], clock })
})
afterEach(async () => {
  await t.close()
})

async function storeId(name: string): Promise<string> {
  const [row] = await t.db.select({ id: stores.id }).from(stores).where(eq(stores.name, name))
  return String(row?.id)
}

async function accountOf(phone: string) {
  const [row] = await t.db.select().from(accounts).where(eq(accounts.phone, phone))
  if (!row) throw new Error(`no account ${phone}`)
  return row
}

const create = (openid: string, key: string, body: unknown = { name: '新客户' }) =>
  call(t, 'POST', '/test/customers', { openid, idempotencyKey: key, body })

describe('权限', () => {
  test('没有销售模块的员工调销售接口 → 403 FORBIDDEN', async () => {
    const res = await call(t, 'GET', '/test/sales-only', { openid: await t.bind('u7') })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', message: '没有权限查看这个页面' })
  })

  test('管理员默认有全部模块', async () => {
    const res = await call(t, 'GET', '/test/sales-only', { openid: await t.bind('u1') })
    expect(res.body).toEqual({ ok: true, data: { ok: true } })
  })

  test('门店、供应商账号不能调员工接口', async () => {
    for (const key of ['s1', 'p1'] as const) {
      const res = await call(t, 'GET', '/test/staff-only', { openid: await t.bind(key) })
      expect(res.status).toBe(403)
    }
  })

  test('门店看别的门店 → 404 NOT_FOUND（不区分不存在和不是你的）', async () => {
    const openid = await t.bind('s1')
    const own = await call(t, 'GET', `/test/stores/${await storeId('滨江店')}`, { openid })
    expect(own.body.data).toMatchObject({ name: '滨江店' })
    const other = await call(t, 'GET', `/test/stores/${await storeId('城西店')}`, { openid })
    expect(other.status).toBe(404)
    expect(other.body.error?.code).toBe('NOT_FOUND')
  })

  test('销售能看所有门店', async () => {
    const res = await call(t, 'GET', `/test/stores/${await storeId('城西店')}`, {
      openid: await t.bind('u2'),
    })
    expect(res.body.data).toMatchObject({ name: '城西店' })
  })
})

describe('错误响应', () => {
  test('未处理的异常 → 500 INTERNAL，不带堆栈，响应头有请求 ID', async () => {
    const res = await call(t, 'GET', '/test/boom', { openid: await t.bind('u1') })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '系统出错了，请稍后再试', fields: null, latest: null },
    })
    expect(JSON.stringify(res.body)).not.toContain('secret')
    expect(res.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('契约没声明的错误码 → 测试环境变成 INTERNAL', async () => {
    const res = await call(t, 'GET', '/test/undeclared', { openid: await t.bind('u1') })
    expect(res.status).toBe(500)
  })

  test('出参结构不对、或带了契约外的字段 → 测试环境 500', async () => {
    const openid = await t.bind('u1')
    expect((await call(t, 'GET', '/test/bad-response', { openid })).status).toBe(500)
    expect((await call(t, 'GET', '/test/extra-field', { openid })).status).toBe(500)
  })

  test('没有这个路由 → 404 NOT_FOUND 统一格式', async () => {
    const res = await call(t, 'GET', '/nope', { openid: await t.bind('u1') })
    expect(res.status).toBe(404)
    expect(res.body.error?.code).toBe('NOT_FOUND')
  })
})

describe('入参校验', () => {
  test('明细行字段错 → 422，fields 键是 lines.0.qty，message 是第一条原因', async () => {
    const res = await call(t, 'POST', '/test/validate', {
      openid: await t.bind('u1'),
      body: { lines: [{ qty: 0 }] },
    })
    expect(res.status).toBe(422)
    expect(res.body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: '数量须为大于 0 的整数',
      fields: { 'lines.0.qty': '数量须为大于 0 的整数' },
    })
  })

  test('规则没写专门提示 → 统一兜底文案', async () => {
    const res = await call(t, 'POST', '/test/validate', {
      openid: await t.bind('u1'),
      body: { lines: 'x' },
    })
    expect(res.body.error?.fields).toEqual({ lines: '格式不对，请检查后重试' })
  })

  test('请求体不是合法 JSON → 422', async () => {
    const res = await call(t, 'POST', '/test/validate', {
      openid: await t.bind('u1'),
      rawBody: '{bad',
    })
    expect(res.status).toBe(422)
    expect(res.body.error?.code).toBe('VALIDATION_FAILED')
  })

  test('新建接口没带幂等键 → 422', async () => {
    const res = await call(t, 'POST', '/test/customers', {
      openid: await t.bind('u2'),
      body: { name: 'x' },
    })
    expect(res.status).toBe(422)
    expect(res.body.error?.fields).toHaveProperty('x-idempotency-key')
  })
})

describe('幂等', () => {
  test('同一个键提交两次只建一次，第二次返回同样的结果', async () => {
    const openid = await t.bind('u2')
    const key = randomUUID()
    const first = await create(openid, key)
    const second = await create(openid, key)
    expect(second.body).toEqual(first.body)
    expect(await t.db.select().from(customers).where(eq(customers.name, '新客户'))).toHaveLength(1)
  })

  test('同一个键并发提交也只建一次', async () => {
    const openid = await t.bind('u2')
    const key = randomUUID()
    const results = await Promise.all([
      create(openid, key),
      create(openid, key),
      create(openid, key),
    ])
    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    expect(new Set(results.map((r) => JSON.stringify(r.body))).size).toBe(1)
    expect(await t.db.select().from(customers).where(eq(customers.name, '新客户'))).toHaveLength(1)
  })

  test('同一个键用在别的接口上 → 422', async () => {
    const openid = await t.bind('u2')
    const key = randomUUID()
    await create(openid, key)
    const res = await call(t, 'POST', '/test/other', { openid, idempotencyKey: key })
    expect(res.status).toBe(422)
  })

  test('业务失败回滚后，同一个键可以重新提交', async () => {
    const openid = await t.bind('u2')
    const key = randomUUID()
    expect((await create(openid, key, { name: '新客户', failAfterLog: true })).status).toBe(500)
    expect(await t.db.select().from(idempotencyKeys)).toHaveLength(0)
    expect((await create(openid, key)).status).toBe(200)
  })
})

describe('事务和日志', () => {
  test('写到一半失败：客户、日志、单号都不留', async () => {
    const res = await create(await t.bind('u2'), randomUUID(), {
      name: '半截客户',
      failAfterLog: true,
    })
    expect(res.status).toBe(500)
    expect(await t.db.select().from(customers).where(eq(customers.name, '半截客户'))).toHaveLength(
      0,
    )
    expect(await t.db.select().from(operationLogs)).toHaveLength(0)
    const next = await create(await t.bind('u2'), randomUUID())
    expect((next.body.data as { no: string }).no).toBe('SO-260930-001')
  })

  test('操作日志记下操作人快照', async () => {
    await create(await t.bind('u2'), randomUUID())
    const [log] = await t.db.select().from(operationLogs)
    expect(log).toMatchObject({
      module: 'sales',
      action: 'create',
      actorLabel: '李敏',
      targetLabel: '新客户',
    })
  })

  test('写事务没写操作日志 → 500（代码错误）', async () => {
    const res = await call(t, 'POST', '/test/no-log', { openid: await t.bind('u1') })
    expect(res.status).toBe(500)
  })
})

describe('版本号', () => {
  test('版本号对得上就改，版本号 +1；拿旧版本再改 → 409 STALE 带最新内容', async () => {
    const openid = await t.bind('u1')
    const target = await accountOf('13700000002')
    const path = `/test/accounts/${String(target.id)}`
    const ok = await call(t, 'PATCH', path, {
      openid,
      body: { version: target.version, name: '李敏A' },
    })
    expect(ok.body.data).toEqual({ version: target.version + 1 })
    const stale = await call(t, 'PATCH', path, {
      openid,
      body: { version: target.version, name: '李敏B' },
    })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({
      code: 'STALE',
      latest: { name: '李敏A', version: target.version + 1 },
    })
  })
})

describe('发号', () => {
  test('同一天依次递增，上海时间跨日从 001 重新开始', async () => {
    const openid = await t.bind('u2')
    const noOf = async (name: string) =>
      ((await create(openid, randomUUID(), { name })).body.data as { no: string }).no
    expect(await noOf('客户1')).toBe('SO-260930-001')
    expect(await noOf('客户2')).toBe('SO-260930-002')
    // UTC 15:59 仍是上海 9 月 30 日，16:00 是 10 月 1 日
    clock.set('2026-09-30T15:59:00.000Z')
    expect(await noOf('客户3')).toBe('SO-260930-003')
    clock.set('2026-09-30T16:00:00.000Z')
    expect(await noOf('客户4')).toBe('SO-261001-001')
  })
})

describe('分页', () => {
  test('按时间倒序，游标翻到底；游标乱写 → 422', async () => {
    const openid = await t.bind('u1')
    for (let i = 0; i < 5; i += 1) {
      await call(t, 'POST', '/test/notify', { openid, body: { topic: 'stock' } })
    }
    const seen: string[] = []
    let cursor: string | null = null
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2'
      const res = await call(t, 'GET', `/test/logs${query}`, { openid })
      const page = res.body.data as { items: { id: string }[]; nextCursor: string | null }
      expect(page.items.length).toBeLessThanOrEqual(2)
      seen.push(...page.items.map((item) => item.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(5)
    expect([...seen].sort((a, b) => Number(b) - Number(a))).toEqual(seen)
    const bad = await call(t, 'GET', '/test/logs?cursor=garbage', { openid })
    expect(bad.status).toBe(422)
    const tooMany = await call(t, 'GET', '/test/logs?limit=51', { openid })
    expect(tooMany.status).toBe(422)
  })
})
