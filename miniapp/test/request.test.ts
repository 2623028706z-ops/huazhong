import { contract, copy, meResponseSchema, type Endpoint, type ErrorCode } from '@huazhong/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { viewOf } from '../miniprogram/core/failure-view'
import { request } from '../miniprogram/core/request'
import { installFakeWx, type ContainerCall, type ContainerReply } from './fake-wx'

vi.mock('../miniprogram/core/config', () => ({
  cloudTarget: () => ({ env: 'test-env', service: 'test-service' }),
}))

// 契约里暂时只有 GET /me；写请求的行为用一个测试专用的接口验证
const renameThing = {
  method: 'POST',
  path: '/things/:id/rename',
  grants: 'any',
  params: meResponseSchema.pick({ id: true }),
  body: meResponseSchema.pick({ name: true }),
  response: meResponseSchema.pick({ id: true }),
  errors: ['STALE'],
  idempotent: true,
} as const satisfies Endpoint

const me = {
  id: '1',
  type: 'admin',
  name: '周总',
  orgLabel: null,
  storeId: null,
  supplierId: null,
  modules: ['sales'],
  landing: 'home',
  menus: ['logs'],
  filters: { modules: ['sales'] },
}

function errorReply(
  statusCode: number,
  error: Record<string, unknown>,
  header = {},
): ContainerReply {
  return {
    statusCode,
    header,
    data: { ok: false, error: { fields: null, latest: null, ...error } },
  }
}

let calls: ContainerCall[]
let replies: ContainerReply[]

beforeEach(() => {
  ;({ calls, replies } = installFakeWx())
})

describe('读请求', () => {
  it('成功时返回 data，路径带 /api/v1 前缀，header 带服务名', async () => {
    replies.push({ statusCode: 200, data: { ok: true, data: me } })
    const result = await request(contract.me)
    expect(result).toEqual({ ok: true, data: me })
    expect(calls[0]?.path).toBe('/api/v1/me')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.header['X-WX-SERVICE']).toBe('test-service')
  })

  it('网络失败自动重试一次，第二次成功就算成功', async () => {
    replies.push('network-error', { statusCode: 200, data: { ok: true, data: me } })
    const result = await request(contract.me)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('重试后还是网络失败，返回网络失败', async () => {
    replies.push('network-error', 'network-error')
    const result = await request(contract.me)
    expect(result).toEqual({ ok: false, failure: { kind: 'network' } })
    expect(calls).toHaveLength(2)
  })

  it('服务端返回错误不重试，请求编号从响应头取（大小写不敏感）', async () => {
    replies.push(
      errorReply(
        500,
        { code: 'INTERNAL', message: copy.error.internal },
        { 'X-Request-ID': 'r-1' },
      ),
    )
    const result = await request(contract.me)
    expect(calls).toHaveLength(1)
    expect(result).toEqual({
      ok: false,
      failure: {
        kind: 'server',
        requestId: 'r-1',
        code: 'INTERNAL',
        message: copy.error.internal,
        fields: null,
        latest: null,
      },
    })
  })

  it('不是花众格式的错误响应按系统出错处理', async () => {
    replies.push({ statusCode: 502, data: '<html>Bad Gateway</html>' })
    const result = await request(contract.me)
    expect(result.ok).toBe(false)
    if (!result.ok && result.failure.kind === 'server') {
      expect(result.failure.code).toBe('INTERNAL')
      expect(result.failure.message).toBe(copy.error.internal)
    }
  })
})

describe('写请求', () => {
  const input = { params: { id: '7' }, body: { name: '新名字' } }

  it('路径参数替换进路径，body 原样发出，带幂等键', async () => {
    replies.push({ statusCode: 200, data: { ok: true, data: { id: '7' } } })
    const result = await request(renameThing, input, { idempotencyKey: 'key-1' })
    expect(result).toEqual({ ok: true, data: { id: '7' } })
    expect(calls[0]).toMatchObject({
      path: '/api/v1/things/7/rename',
      method: 'POST',
      data: { name: '新名字' },
      header: { 'X-Idempotency-Key': 'key-1' },
    })
  })

  it('网络失败不自动重试', async () => {
    replies.push('network-error')
    const result = await request(renameThing, input, { idempotencyKey: 'key-1' })
    expect(result).toEqual({ ok: false, failure: { kind: 'network' } })
    expect(calls).toHaveLength(1)
  })

  it('同一个写请求还没回来时再提交，只发一次', async () => {
    replies.push({ statusCode: 200, data: { ok: true, data: { id: '7' } } })
    const first = request(renameThing, input, { idempotencyKey: 'key-1' })
    const second = request(renameThing, input, { idempotencyKey: 'key-1' })
    expect(second).toBe(first)
    await first
    expect(calls).toHaveLength(1)
  })

  it('上一次回来以后再提交，会重新发', async () => {
    replies.push({ statusCode: 200, data: { ok: true, data: { id: '7' } } })
    replies.push({ statusCode: 200, data: { ok: true, data: { id: '7' } } })
    await request(renameThing, input, { idempotencyKey: 'key-1' })
    await request(renameThing, input, { idempotencyKey: 'key-1' })
    expect(calls).toHaveLength(2)
  })
})

describe('失败转成界面状态', () => {
  const server = (code: ErrorCode, extra: Record<string, unknown> = {}) =>
    ({
      kind: 'server',
      requestId: 'r-9',
      code,
      message: '后端的句子',
      fields: null,
      latest: null,
      ...extra,
    }) as const

  it('没绑定账号去登录页', () => {
    expect(viewOf(server('UNAUTHENTICATED'), 'load')).toEqual({ kind: 'login' })
  })
  it('停用、无权限、找不到是整页状态，写后端的句子', () => {
    expect(viewOf(server('ACCOUNT_DISABLED'), 'load')).toMatchObject({
      kind: 'page',
      state: 'accountDisabled',
    })
    expect(viewOf(server('FORBIDDEN'), 'submit')).toMatchObject({
      kind: 'page',
      state: 'forbidden',
    })
    expect(viewOf(server('NOT_FOUND'), 'refresh')).toMatchObject({
      kind: 'page',
      state: 'notFound',
      message: '后端的句子',
    })
  })
  it('字段校验失败按字段标红', () => {
    const fields = { 'lines.0.qty': '数量要大于 0' }
    expect(viewOf(server('VALIDATION_FAILED', { fields }), 'submit')).toEqual({
      kind: 'fields',
      message: '后端的句子',
      fields,
    })
  })
  it('内容过期带最新内容', () => {
    expect(viewOf(server('STALE', { latest: { version: 5 } }), 'submit')).toEqual({
      kind: 'stale',
      message: '后端的句子',
      latest: { version: 5 },
    })
  })
  it('业务规则在页面里写原因，不带请求编号', () => {
    expect(viewOf(server('BUSINESS_RULE'), 'submit')).toEqual({
      kind: 'inline',
      message: '后端的句子',
      requestId: null,
    })
  })
  it('系统出错显示请求编号', () => {
    expect(viewOf(server('INTERNAL'), 'submit')).toEqual({
      kind: 'inline',
      message: '后端的句子',
      requestId: 'r-9',
    })
    expect(viewOf(server('INTERNAL'), 'refresh')).toMatchObject({ kind: 'inline' })
  })
  it('首次加载就系统出错：整页状态 + 请求编号', () => {
    expect(viewOf(server('INTERNAL'), 'load')).toEqual({
      kind: 'page',
      state: 'internal',
      message: '后端的句子',
      requestId: 'r-9',
    })
  })
  it('断网：首次加载整页状态，刷新和提交在页面里提示', () => {
    const network = { kind: 'network' } as const
    expect(viewOf(network, 'load')).toEqual({
      kind: 'page',
      state: 'network',
      message: copy.network.loadFailed,
    })
    expect(viewOf(network, 'refresh')).toEqual({
      kind: 'inline',
      message: copy.network.refreshFailed,
      requestId: null,
    })
    expect(viewOf(network, 'submit')).toEqual({
      kind: 'inline',
      message: copy.network.submitFailed,
      requestId: null,
    })
  })
})
