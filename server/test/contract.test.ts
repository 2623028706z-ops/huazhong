// 契约和路由一一对应：契约里有、后端没实现 → 失败；后端有、契约里没有 → 失败（05 章第 1.1 节；07 章 J21）
import { contract, type Endpoint } from '@huazhong/shared'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { DiscoveryModule, DiscoveryService, MetadataScanner } from '@nestjs/core'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { ENDPOINT_METADATA } from '../src/common/endpoint.ts'
import { startApp, type TestApp } from './support/app.ts'

let t: TestApp
beforeAll(async () => {
  // 只挂正式模块（不挂测试专用接口）
  t = await startApp({ imports: [DiscoveryModule] })
})
afterAll(async () => {
  await t.close()
})

interface FoundRoute {
  handler: string
  method: string
  path: unknown
  endpoint: Endpoint | undefined
}

function routesOf(app: TestApp['app']): FoundRoute[] {
  const scanner = app.get(MetadataScanner)
  const routes: FoundRoute[] = []
  for (const wrapper of app.get(DiscoveryService).getControllers()) {
    const proto = Object.getPrototypeOf(wrapper.instance) as Record<string, unknown>
    for (const name of scanner.getAllMethodNames(proto)) {
      const fn = proto[name] as object
      const path: unknown = Reflect.getMetadata(PATH_METADATA, fn)
      if (path === undefined) continue
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod]
      const endpoint = Reflect.getMetadata(ENDPOINT_METADATA, fn) as Endpoint | undefined
      routes.push({ handler: `${wrapper.name}.${name}`, method, path, endpoint })
    }
  }
  return routes
}

const keyOf = (e: { method: string; path: unknown }) => `${e.method} ${String(e.path)}`

test('每个路由都用 @Route 绑定了契约，方法和路径一致', () => {
  for (const route of routesOf(t.app)) {
    expect(route.endpoint, route.handler).toBeDefined()
    expect(keyOf(route), route.handler).toBe(keyOf(route.endpoint ?? { method: '', path: '' }))
  }
})

test('契约里的接口和后端路由一一对应', () => {
  const implemented = routesOf(t.app).map(keyOf).sort()
  const declared = Object.values(contract).map(keyOf).sort()
  expect(implemented).toEqual(declared)
})
