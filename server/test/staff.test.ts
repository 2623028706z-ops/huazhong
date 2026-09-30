// 员工与岗位（05 章第 3 节；07 章 G24、G25）
import { randomUUID } from 'node:crypto'
import { contract, WS_CLOSE, type StaffItem } from '@huazhong/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { accounts, operationLogs } from '../db/schema/index.ts'
import { startApp, type TestApp } from './support/app.ts'
import { call } from './support/http.ts'
import { connect } from './support/ws.ts'

let t: TestApp
let admin: string
beforeEach(async () => {
  t = await startApp()
  admin = await t.bind('u1')
})
afterEach(async () => {
  await t.close()
})

interface StaffPage {
  items: StaffItem[]
  actions: { code: string }[]
}

const list = (openid = admin) => call(t, 'GET', contract.listStaff.path, { openid })
const create = (body: unknown) =>
  call(t, 'POST', contract.createStaff.path, {
    openid: admin,
    body,
    idempotencyKey: randomUUID(),
  })
const update = (id: string, body: unknown) =>
  call(t, 'PATCH', `/staff/${id}`, { openid: admin, body })
const unbindWechat = (id: string, version: number) =>
  call(t, 'POST', `/staff/${id}/unbind-wechat`, { openid: admin, body: { version } })

async function staffNamed(name: string): Promise<StaffItem> {
  const page = (await list()).body.data as StaffPage
  const found = page.items.find((item) => item.name === name)
  if (!found) throw new Error(`no staff ${name}`)
  return found
}

const edit = (item: StaffItem) => ({
  version: item.version,
  name: item.name,
  phone: item.phone,
  admin: item.admin,
  modules: item.modules,
  enabled: item.enabled,
})

describe('员工列表', () => {
  test('只列员工和管理员，按新增先后；列表级有「新增员工」', async () => {
    const page = (await list()).body.data as StaffPage
    expect(page.items.map((item) => item.name)).toEqual([
      '周总',
      '李敏',
      '王芳',
      '周宁',
      '陈青',
      '许静',
      '赵磊',
    ])
    expect(page.items[0]).toMatchObject({ admin: true, modules: [] })
    expect(page.items[2]?.modules).toEqual(['sales', 'warehouse'])
    expect(page.actions.map((a) => a.code)).toEqual(['create'])
  })

  test('已绑定微信的员工才有「解绑微信」', async () => {
    await t.bind('u2')
    expect((await staffNamed('李敏')).actions).toEqual([
      { code: 'unbindStaffWechat', enabled: true, disabledReason: null, reasonRequired: false },
    ])
    expect((await staffNamed('王芳')).actions).toEqual([])
  })

  test('不是管理员 → FORBIDDEN', async () => {
    expect((await list(await t.bind('u2'))).status).toBe(403)
  })
})

describe('新增员工', () => {
  test('新增发货员工：写公共日志「新增员工」', async () => {
    const res = await create({
      name: '孙悦',
      phone: '13700000008',
      admin: false,
      modules: ['shipping'],
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ name: '孙悦', modules: ['shipping'], enabled: true })
    const [log] = await t.db
      .select()
      .from(operationLogs)
      .where(and(isNull(operationLogs.module), eq(operationLogs.action, '新增员工')))
    expect(log?.after).toMatchObject({ 名字: '孙悦', 岗位: '发货', 状态: '启用' })
  })

  test('字段校验：名字、手机号重复、普通员工不选模块', async () => {
    const noName = await create({
      name: ' ',
      phone: '13700000008',
      admin: false,
      modules: ['sales'],
    })
    expect(noName.body.error?.fields).toEqual({ name: '请填写名字' })
    const taken = await create({
      name: '孙悦',
      phone: '13700000002',
      admin: false,
      modules: ['sales'],
    })
    expect(taken.status).toBe(422)
    expect(taken.body.error?.fields).toEqual({ phone: '这个手机号已经被其他账号使用' })
    const noModule = await create({ name: '孙悦', phone: '13700000008', admin: false, modules: [] })
    expect(noModule.body.error?.fields).toEqual({ modules: '请至少选一个模块' })
  })

  test('管理员不选模块也能保存，模块不存', async () => {
    const res = await create({
      name: '孙悦',
      phone: '13700000008',
      admin: true,
      modules: ['sales'],
    })
    expect(res.body.data).toMatchObject({ admin: true, modules: [] })
  })
})

describe('修改员工', () => {
  test('唯一的管理员不能降级、不能停用', async () => {
    const zhou = await staffNamed('周总')
    const demote = await update(zhou.id, { ...edit(zhou), admin: false, modules: ['sales'] })
    expect(demote.body.error?.message).toBe('至少要保留一个启用的管理员')
    const disable = await update(zhou.id, { ...edit(zhou), enabled: false })
    expect(disable.body.error?.message).toBe('至少要保留一个启用的管理员')
  })

  test('不改内容 → 没有修改内容；版本旧了 → STALE 带最新', async () => {
    const li = await staffNamed('李敏')
    expect((await update(li.id, edit(li))).body.error?.message).toBe('没有修改内容')
    await update(li.id, { ...edit(li), name: '李敏敏' })
    const stale = await update(li.id, { ...edit(li), name: '李小敏' })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({
      code: 'STALE',
      message: '这个员工刚被修改，已刷新成最新内容',
    })
    expect(stale.body.error?.latest).toMatchObject({ name: '李敏敏', version: li.version + 1 })
  })

  test('改手机号自动解绑微信，日志原因「同时解绑微信」，连接关闭', async () => {
    const openid = await t.bind('u2')
    const ws = await connect(t, openid)
    const li = await staffNamed('李敏')
    const res = await update(li.id, { ...edit(li), phone: '13700000018' })
    expect(res.status).toBe(200)
    expect((res.body.data as StaffItem).actions).toEqual([])
    expect(await ws.closed).toBe(WS_CLOSE.unauthenticated)
    const [log] = await t.db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.action, '修改员工'))
    expect(log).toMatchObject({ reason: '同时解绑微信' })
    expect(log?.before).toMatchObject({ 登录手机号: '13700000002' })
  })

  test('停用员工自动解绑；只改名字不解绑', async () => {
    await t.bind('u2')
    await t.bind('u3')
    const wang = await staffNamed('王芳')
    await update(wang.id, { ...edit(wang), name: '王小芳' })
    expect((await staffNamed('王小芳')).actions).toHaveLength(1)
    const li = await staffNamed('李敏')
    await update(li.id, { ...edit(li), enabled: false })
    const [row] = await t.db.select().from(accounts).where(eq(accounts.phone, '13700000002'))
    expect(row).toMatchObject({ enabled: false, openid: null })
  })

  test('门店账号的 id → NOT_FOUND', async () => {
    const [store] = await t.db.select().from(accounts).where(eq(accounts.type, 'store'))
    const li = await staffNamed('李敏')
    expect((await update(String(store?.id), edit(li))).status).toBe(404)
  })
})

describe('管理员解绑员工微信', () => {
  test('解绑后没有「解绑微信」；再解绑 → STALE「这个员工还没绑定微信」', async () => {
    await t.bind('u3')
    const wang = await staffNamed('王芳')
    const res = await unbindWechat(wang.id, wang.version)
    expect(res.status).toBe(200)
    expect((res.body.data as StaffItem).actions).toEqual([])
    const again = await unbindWechat(wang.id, wang.version + 1)
    expect(again.body.error).toMatchObject({ code: 'STALE', message: '这个员工还没绑定微信' })
  })
})
