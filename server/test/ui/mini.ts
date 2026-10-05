// 微信工具运行正式页面；仅把云托管传输转发至本地真实 NestJS 和 PostgreSQL。
import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
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

// 开发者工具的模拟器文件存储有上限：截图、生成单据图片都会在模拟器 tmp 目录留一个文件，
// 攒满以后截图报 saveFile:fail exceeded the maximum size of the file storage limit。
// tmp 在小程序里删不掉（permission denied），只能从本机目录删：
// ~/Library/Application Support/微信开发者工具/<用户>/WeappSimulator/WeappFileSystem/[<微信号>/]<appid>/tmp
const devtoolsRoot = join(homedir(), 'Library/Application Support/微信开发者工具')
async function appIdOf(): Promise<string> {
  const config = await readFile(
    resolve(import.meta.dirname, '../../../miniapp/project.config.json'),
    'utf8',
  )
  return (JSON.parse(config) as { appid: string }).appid
}
async function childrenOf(dir: string): Promise<string[]> {
  return readdir(dir).then(
    (names) => names.map((name) => join(dir, name)),
    () => [],
  )
}
export async function clearDevtoolsFiles(mini: MiniProgram) {
  const appId = await appIdOf()
  for (const user of await childrenOf(devtoolsRoot)) {
    const base = join(user, 'WeappSimulator/WeappFileSystem')
    const owners = [base, ...(await childrenOf(base))]
    for (const owner of owners) {
      for (const file of await childrenOf(join(owner, appId, 'tmp')))
        await rm(file, { recursive: true, force: true })
    }
  }
  // 本地缓存（wx.setStorage）也一起清，免得撞上 10MB 上限
  await mini.callWxMethod('clearStorageSync')
}

export function setupMiniSuite() {
  let mini: MiniProgram
  let server: SalesApp
  beforeAll(async () => {
    mini = await connectMini()
    await clearDevtoolsFiles(mini)
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

// 长跑时偶尔刚进页面就被别的跳转顶掉（之后读页面报 page is not on top of page stack），
// 进页后稍等再看一眼，不在顶上就重进一次，并把被顶到哪一页写到日志里
export async function enter(mini: MiniProgram, path: string): Promise<Page> {
  const route = path.slice(1).split('?')[0] ?? ''
  for (let attempt = 1; ; attempt++) {
    await mini.reLaunch(path)
    const page = await waitPage(mini, route)
    await mini.evaluate('function () { getApp().onShow() }')
    await page.waitFor(300)
    const top = (await mini.currentPage())?.path
    if (top === route || attempt === 2) return page
    process.stderr.write(`enter ${route}: replaced by ${top ?? 'nothing'}, retrying\n`)
  }
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
  const path = resolve(screenshotDir, `${name}.png`)
  try {
    await mini.screenshot({ path })
  } catch (error) {
    if (!String(error).includes('exceeded the maximum size')) throw error
    await clearDevtoolsFiles(mini)
    await mini.screenshot({ path })
  }
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

// 日期仍是微信原生 picker；选一个是底部选择弹层（定稿 108）：点开框，再点弹层里那一行
export async function pickOption(page: Page | CustomElement, selector: string, value: string) {
  const component = (await page.$(selector)) as CustomElement | null
  if (!component) throw new Error(`no picker ${selector}`)
  if ((await component.data('mode')) === 'date') {
    const picker = await component.$('picker')
    if (!picker) throw new Error(`no date picker ${selector}`)
    await picker.trigger('change', { value })
    return
  }
  await component.callMethod('onOpen')
  const rows = (await component.data('rows')) as { id: string }[]
  const index = rows.findIndex((row) => row.id === value)
  const choice = ((await component.$$('.u-choice')) as CustomElement[])[index]
  if (index < 0 || !choice) throw new Error(`no picker option ${value}`)
  await choice.tap()
  await expect.poll(async () => component.data('open') as Promise<unknown>).toBe(false)
}
