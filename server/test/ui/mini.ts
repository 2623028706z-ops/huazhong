// 微信工具运行正式页面；仅把云托管传输转发至本地真实 NestJS 和 PostgreSQL。
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import automator from 'miniprogram-automator'
import type {
  CustomElement,
  InputElement,
  TextareaElement,
} from 'miniprogram-automator/out/Element.js'
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest'
import type { SeedAccountKey } from '../../db/seed/data.ts'
import { startSales, type SalesApp } from '../support/sales.ts'
import type { PoDetail } from '@huazhong/shared'
import { payInput } from '../support/purchase.ts'

export type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
export type Page = NonNullable<Awaited<ReturnType<MiniProgram['currentPage']>>>

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

export async function paymentInput(server: SalesApp, document: PoDetail, amountCents?: number) {
  const input = await payInput(server, document)
  return { ...input, amountCents: amountCents ?? input.amountCents }
}

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

export async function tapControl(control: CustomElement) {
  const button = await control.$('miniprogram_npm\\/tdesign-miniprogram\\/button\\/button')
  const target = button ? await button.$('button') : await control.$('.hz-button__text')
  if (!target) throw new Error('no rendered button')
  await target.tap()
}

export async function tapText(page: Page | CustomElement, text: string) {
  const buttons = (await page.$$('components\\/hz-button\\/index')) as CustomElement[]
  for (const button of buttons) {
    if ((await button.data('text')) !== text) continue
    const target = await button.size()
    if (Number(target.height) === 0) continue
    await tapControl(button)
    return
  }
  throw new Error(`no rendered button ${text}`)
}

export async function inputField(page: Page | CustomElement, selector: string, value: string) {
  const field = await page.$(selector)
  const control =
    (await field?.$('miniprogram_npm\\/tdesign-miniprogram\\/input\\/input')) ??
    (await field?.$('miniprogram_npm\\/tdesign-miniprogram\\/textarea\\/textarea'))
  const input = (await control?.$('input')) ?? (await control?.$('textarea'))
  if (!input) throw new Error(`no input ${selector}`)
  await (input as InputElement | TextareaElement).input(value)
}

export async function pickOption(page: Page | CustomElement, selector: string, value: string) {
  const component = (await page.$(selector)) as CustomElement | null
  const picker = await component?.$('picker')
  if (!component || !picker) throw new Error(`no picker ${selector}`)
  const mode = (await component.data('mode')) as string
  const options = (await component.data('options')) as { id: string }[]
  const index = options.findIndex((option) => option.id === value)
  if (mode !== 'date' && index < 0) throw new Error(`no picker option ${value}`)
  await picker.trigger('change', { value: mode === 'date' ? value : String(index) })
}
