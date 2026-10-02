// 微信工具运行正式页面；仅把云托管传输转发至本地真实 NestJS 和 PostgreSQL。
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import automator from 'miniprogram-automator'
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest'
import type { SeedAccountKey } from '../../db/seed/data.ts'
import { startSales, type SalesApp } from '../support/sales.ts'

export type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['currentPage']>>>

interface ContainerOptions {
  path: string
  method: string
  header: Record<string, string>
  data?: unknown
}
interface HttpResponse {
  statusCode: number
  data: unknown
  header: Record<string, unknown>
}
declare const wx: {
  request(options: Record<string, unknown>): void
  connectSocket(options: Record<string, unknown>): unknown
}
declare function getApp(): { uiRequests: unknown[] }
export const screenshotDir = process.env.HZ_UI_SCREENSHOTS ?? resolve('.artifacts/stage4-screens')

export async function connectMini(): Promise<MiniProgram> {
  await mkdir(screenshotDir, { recursive: true })
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  mini.on('exception', (event: unknown) => process.stderr.write(JSON.stringify(event) + '\n'))
  return mini
}

export function setupMiniSuite() {
  let mini: MiniProgram
  let server: SalesApp
  beforeAll(async () => {
    mini = await connectMini()
  })
  beforeEach(async () => {
    server = await startSales()
  })
  afterEach(async () => {
    try {
      await mini.callWxMethod('disableAlertBeforeUnload')
      await mini.evaluate('function () { getApp().onHide() }')
      // 和 automator 的路由方法一致，等原生返回动画结束后再发起下一次跳转。
      const page = await mini.currentPage()
      await page?.waitFor(3000)
      await mini.reLaunch('/pages/dev-gallery/index')
    } finally {
      await server.close()
    }
  })
  afterAll(async () => {
    await mini.restoreWxMethod('cloud.callContainer')
    await mini.restoreWxMethod('cloud.connectContainer')
    mini.disconnect()
  })
  return () => ({ mini, server })
}

export async function asMini(mini: MiniProgram, s: SalesApp, key: SeedAccountKey) {
  await mini.callWxMethod('disableAlertBeforeUnload')
  await mini.evaluate('function () { getApp().onHide() }')
  await mini.evaluate('function () { getApp().uiRequests = [] }')
  const api = await s.as(key)
  await mini.mockWxMethod(
    'cloud.callContainer',
    function (options: ContainerOptions, base: string, openid: string) {
      return new Promise((resolve, reject) => {
        wx.request({
          url: base + options.path,
          method: options.method,
          data: options.data,
          header: { ...options.header, 'x-wx-openid': openid },
          success: (response: HttpResponse) => {
            getApp().uiRequests.push({ path: options.path, response })
            resolve({
              statusCode: response.statusCode,
              data: response.data,
              header: response.header,
            })
          },
          fail: (error: unknown) => {
            getApp().uiRequests.push({ path: options.path, error })
            reject(new Error(JSON.stringify(error)))
          },
        })
      })
    },
    s.t.baseUrl,
    api.openid,
  )
  await mini.mockWxMethod(
    'cloud.connectContainer',
    function (_options: unknown, base: string, openid: string) {
      return {
        socketTask: wx.connectSocket({
          url: base.replace('http:', 'ws:') + '/ws',
          header: { 'x-wx-openid': openid },
        }),
      }
    },
    s.t.baseUrl,
    api.openid,
  )
  const me: unknown = await mini.evaluate(
    'function () { return new Promise(function(resolve) { wx.cloud.callContainer({path:"/api/v1/me", method:"GET", header:{}, success:resolve, fail:resolve}) }) }',
  )
  expect(me).toMatchObject({ statusCode: 200, data: { ok: true } })
  return api
}

export async function enter(mini: MiniProgram, path: string): Promise<Page> {
  await mini.reLaunch(path)
  const page = await waitPage(mini, path.slice(1).split('?')[0] ?? '')
  await mini.evaluate('function () { getApp().onShow() }')
  return page
}

export async function waitData(page: Page, key: string, value: unknown) {
  try {
    await expect.poll(async () => page.data(key) as Promise<unknown>).toEqual(value)
  } catch (error) {
    const state: unknown = await page.data().catch((cause: unknown) => String(cause))
    throw new Error(`${page.path}.${key}: ${JSON.stringify(state)}`, { cause: error })
  }
}

export async function waitPage(mini: MiniProgram, path: string): Promise<Page> {
  await expect.poll(async () => (await mini.currentPage())?.path).toBe(path)
  const page = await mini.currentPage()
  if (!page) throw new Error(`no page ${path}`)
  return page
}

export async function snap(mini: MiniProgram, name: string) {
  await mini.callWxMethod('hideToast')
  await mini.evaluate(
    'function () { return new Promise(function(resolve) { wx.nextTick(resolve) }) }',
  )
  const page = await mini.currentPage()
  await page?.waitFor(350)
  await mini.screenshot({ path: resolve(screenshotDir, `${name}.png`) })
}
