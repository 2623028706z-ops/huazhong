// 阶段 3 接口测试的公共准备：时钟拨到示例数据的「今天」（2026-09-29，上海上午 10 点），
// 按账号取 openid、按单号 / 名称取 id（07 章第 12 节）
import { randomUUID } from 'node:crypto'
import type { CustomerItem } from '@huazhong/shared'
import { eq, sql } from 'drizzle-orm'
import type { SeedAccountKey } from '../../db/seed/data.ts'
import { accounts } from '../../db/schema/index.ts'
import { startApp, type TestApp } from './app.ts'
import { TestClock } from './clock.ts'
import { call, type ApiResponse } from './http.ts'

export const TODAY = '2026-09-29'
export const TOMORROW = '2026-09-30'
export const NOW = '2026-09-29T02:00:00.000Z'

export interface SalesApp {
  t: TestApp
  clock: TestClock
  // 每个账号绑一次，之后复用
  as(key: SeedAccountKey): Promise<Api>
  close(): Promise<void>
}

export interface Api {
  openid: string
  get(path: string): Promise<ApiResponse>
  post(path: string, body?: unknown): Promise<ApiResponse>
  put(path: string, body: unknown): Promise<ApiResponse>
  patch(path: string, body: unknown): Promise<ApiResponse>
  del(path: string): Promise<ApiResponse>
}

export function apiOf(t: TestApp, openid: string): Api {
  // 新建类接口都要幂等键；别的接口不看这个头
  const send = (method: string, path: string, body?: unknown) =>
    call(t, method, path, { openid, body, idempotencyKey: randomUUID() })
  return {
    openid,
    get: (path) => send('GET', path),
    post: (path, body = {}) => send('POST', path, body),
    put: (path, body) => send('PUT', path, body),
    patch: (path, body) => send('PATCH', path, body),
    del: (path) => send('DELETE', path),
  }
}

export async function startSales(): Promise<SalesApp> {
  const clock = new TestClock(Date.parse(NOW))
  const t = await startApp({ clock })
  const apis = new Map<SeedAccountKey, Api>()
  return {
    t,
    clock,
    async as(key) {
      const existing = apis.get(key)
      if (existing) return existing
      const api = apiOf(t, await t.bind(key))
      apis.set(key, api)
      return api
    },
    close: () => t.close(),
  }
}

type Lookup =
  'orders.no' | 'afters.no' | 'receipts.no' | 'customers.name' | 'stores.name' | 'products.name'

export async function idBy(t: TestApp, lookup: Lookup, value: string): Promise<string> {
  const [table, column] = lookup.split('.')
  const result = await t.db.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table ?? '')} WHERE ${sql.identifier(column ?? '')} = ${value}`,
  )
  const id = result.rows[0]?.id
  if (id === undefined) throw new Error(`no ${lookup} = ${value}`)
  return id
}

// 响应里的 data（测试里按需要断言结构）
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- 用例按接口声明响应结构，同原有测试的 as 写法
export function dataOf<T>(res: ApiResponse): T {
  if (!res.body.ok)
    throw new Error(`expected ok, got ${res.status} ${JSON.stringify(res.body.error)}`)
  return res.body.data as T
}

// 给没有门店账号的门店开账号（销售填登录手机号），再绑一个 openid；种子里只有滨江店有门店账号
export async function openStoreAccount(
  s: SalesApp,
  name: string,
  loginPhone: string,
): Promise<Api> {
  const sales = await s.as('u2')
  const page = dataOf<{ items: CustomerItem[] }>(await sales.get('/customers'))
  const store = page.items.flatMap((c) => c.stores).find((item) => item.name === name)
  if (!store) throw new Error(`no store ${name}`)
  dataOf(
    await sales.patch(`/stores/${store.id}`, {
      version: store.version,
      name: store.name,
      contact: store.contact,
      phone: store.phone,
      address: store.address,
      enabled: store.enabled,
      loginPhone,
    }),
  )
  const openid = `openid-${loginPhone}-${randomUUID()}`
  await s.t.db
    .update(accounts)
    .set({ openid, boundAt: new Date() })
    .where(eq(accounts.phone, loginPhone))
  return apiOf(s.t, openid)
}

export function codesOf(actions: readonly { code: string }[]): string[] {
  return actions.map((action) => action.code)
}
