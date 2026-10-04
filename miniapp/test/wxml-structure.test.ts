// WXML 结构静态核对。两类错误开发者工具不报、真机也不报，只是整块出不来：
// 少一个结束标签，整个分包编译卡死（2026-10-04 花材详情少一个 </view>，仓库模块全部打不开）；
// 页面（含 import 进来的模板）用了 hz- 组件却没在 json 里登记，那块就不渲染；
// 用了图标字体里没有的图标，那格空着（仓库首页「出库」「手工入库」栽过）
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { iconNames } from '../miniprogram/core/icon-names'

const ROOT = join(import.meta.dirname, '../miniprogram')

function wxmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'miniprogram_npm' ? [] : wxmlFiles(path)
    return entry.name.endsWith('.wxml') ? [path] : []
  })
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'miniprogram_npm' ? [] : tsFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const stripped = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, 'x')

function unbalanced(file: string): string | null {
  const stack: string[] = []
  for (const [, close, tag = '', , self] of stripped(file).matchAll(
    /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g,
  )) {
    if (self) continue
    if (!close) stack.push(tag)
    else if (stack.pop() !== tag) return `多出 </${tag}>`
  }
  return stack.length ? `没关上 <${stack.join('> <')}>` : null
}

function tagsOf(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file) || !existsSync(file)) return new Set()
  seen.add(file)
  const source = stripped(file)
  const tags = new Set([...source.matchAll(/<(hz-[a-z-]+)/g)].map((m) => m[1] ?? ''))
  for (const [, src = ''] of source.matchAll(/<(?:import|include) src="([^"]+)"/g)) {
    const path = src.startsWith('/') ? join(ROOT, src) : join(dirname(file), src)
    for (const tag of tagsOf(path, seen)) tags.add(tag)
  }
  return tags
}

const usingOf = (json: string): Record<string, string> =>
  existsSync(json)
    ? ((JSON.parse(readFileSync(json, 'utf8')) as { usingComponents?: Record<string, string> })
        .usingComponents ?? {})
    : {}

describe('WXML 结构', () => {
  const files = wxmlFiles(ROOT)
  const global = usingOf(join(ROOT, 'app.json'))

  it('每个文件的标签都配对', () => {
    const broken = files.flatMap((file) => {
      const problem = unbalanced(file)
      return problem ? [`${relative(ROOT, file)}: ${problem}`] : []
    })
    expect(broken).toEqual([])
  })

  it('页面和组件用到的 hz- 组件都在 json 里登记', () => {
    const missing = files
      .filter((file) => !relative(ROOT, file).startsWith('views'))
      .flatMap((file) => {
        const own = file.endsWith('/index.wxml') ? file.replace(/\/index\.wxml$/, '') : ''
        const using = usingOf(file.replace(/\.wxml$/, '.json'))
        return [...tagsOf(file)]
          .filter((tag) => !using[tag] && !global[tag] && !own.endsWith(`/${tag}`))
          .map((tag) => `${relative(ROOT, file)}: ${tag}`)
      })
    expect(missing).toEqual([])
  })
  it('用到的图标都在图标字体里', () => {
    const known = new Set<string>(iconNames)
    // 入口格的图标写在 ts 里（icon: 'truck'），toast 的 icon 是微信自带的不算
    const toast = new Set(['none', 'success', 'error', 'loading'])
    const sources = [...files, ...tsFiles(ROOT)]
    const missing = sources.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/hz-icon--([a-z0-9-]+)|icon: '([a-z0-9-]+)'/g)]
        .map((m) => m[1] ?? m[2] ?? '')
        .filter((name) => !toast.has(name) && !known.has(name))
        .map((name) => `${relative(ROOT, file)}: ${name}`),
    )
    expect(missing).toEqual([])
  })
})
