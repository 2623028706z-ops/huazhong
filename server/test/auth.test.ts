// 手机号快速验证绑定、退出登录（05 章第 2 节；07 章 G18、G22、G23）
import { contract, WS_CLOSE, type Me } from '@huazhong/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, operationLogs, stores } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { call } from './support/http.ts'
import { phoneCode } from './support/phone.ts'
import { connect } from './support/ws.ts'

let t: TestApp
beforeEach(async () => {
  t = await startApp()
})
afterEach(async () => {
  await t.close()
})

const bind = (openid: string, code: string) =>
  call(t, 'POST', contract.bindPhone.path, { openid, body: { code } })
const unbind = (openid: string) => call(t, 'POST', contract.unbind.path, { openid })

async function openidOf(phone: string): Promise<string | null> {
  const [row] = await t.db
    .select({ openid: accounts.openid })
    .from(accounts)
    .where(eq(accounts.phone, phone))
  return row?.openid ?? null
}

describe('绑定微信', () => {
  test('用预录手机号绑定：返回当前账号，写 openid 和公共日志', async () => {
    const res = await bind('openid-a', phoneCode('13700000002'))
    expect(res.status).toBe(200)
    expect(res.body.data as Me).toMatchObject({
      name: '李敏',
      phone: '13700000002',
      landing: 'module:sales',
    })
    expect(await openidOf('13700000002')).toBe('openid-a')
    const [log] = await t.db
      .select()
      .from(operationLogs)
      .where(and(isNull(operationLogs.module), eq(operationLogs.action, '绑定微信')))
    expect(log).toMatchObject({ kind: '账号', targetLabel: '李敏', actorLabel: '李敏' })
  })

  test('同一 openid 再调一次：直接返回当前账号', async () => {
    await bind('openid-a', phoneCode('13700000002'))
    const res = await bind('openid-a', 'anything')
    expect(res.status).toBe(200)
    expect((res.body.data as Me).name).toBe('李敏')
  })

  test('账号已绑别的微信 → BUSINESS_RULE', async () => {
    await bind('openid-a', phoneCode('13700000002'))
    const res = await bind('openid-b', phoneCode('13700000002'))
    expect(res.status).toBe(409)
    expect(res.body.error?.message).toBe('这个账号已绑定其他微信，请联系管理员解绑')
  })

  test('没预录的手机号、无效令牌 → BUSINESS_RULE', async () => {
    const unknown = await bind('openid-a', phoneCode('13199999999'))
    expect(unknown.body.error?.message).toBe('这个手机号还没开通，请联系花众管理员')
    const invalid = await bind('openid-a', 'bad-code')
    expect(invalid.body.error?.message).toBe('手机号验证失败，请重试')
  })

  test('没带 openid → 401', async () => {
    const res = await call(t, 'POST', contract.bindPhone.path, { body: { code: 'x' } })
    expect(res.status).toBe(401)
  })

  test('账号停用、门店停用 → ACCOUNT_DISABLED，不绑定', async () => {
    await t.db.update(accounts).set({ enabled: false }).where(eq(accounts.phone, '13700000005'))
    const staff = await bind('openid-a', phoneCode('13700000005'))
    expect(staff.status).toBe(403)
    expect(staff.body.error?.message).toBe('账号已停用，请联系花众')
    await t.db.update(stores).set({ enabled: false }).where(eq(stores.name, '滨江店'))
    const store = await bind('openid-b', phoneCode('13800138001'))
    expect(store.body.error?.message).toBe('这家门店已停用，请联系花众')
    expect(await openidOf('13800138001')).toBeNull()
  })
})

describe('退出登录', () => {
  test('解绑后 openid 清空、连接关闭 4401，再调 /me 是 401', async () => {
    const openid = await t.bind('u2')
    const ws = await connect(t, openid)
    const res = await unbind(openid)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({})
    expect(await openidOf('13700000002')).toBeNull()
    expect(await ws.closed).toBe(WS_CLOSE.unauthenticated)
    expect((await call(t, 'GET', contract.me.path, { openid })).status).toBe(401)
  })

  test('门店停用的账号也能退出', async () => {
    const openid = await t.bind('s1')
    await t.db.update(stores).set({ enabled: false }).where(eq(stores.name, '滨江店'))
    expect((await unbind(openid)).status).toBe(200)
    expect(await openidOf('13800138001')).toBeNull()
  })

  test('没绑账号的 openid 退出：直接返回，不写日志', async () => {
    const before = await t.db.select().from(operationLogs)
    expect((await unbind('openid-nobody')).status).toBe(200)
    expect(await t.db.select().from(operationLogs)).toHaveLength(before.length)
  })
})
