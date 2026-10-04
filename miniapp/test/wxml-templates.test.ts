// WXML 模板只能看到调用处 data 里传进去的变量；漏传不会报错，只是悄悄显示空（收货改价原因框、核对弹层最新缺口都栽在这里）。
// 这里静态核对：每个列出变量名的 <template is data="{{a, b}}"> 调用，都要传齐模板里用到的顶层变量；
// 故意可选的变量在模板定义里用「<!-- 可不传：… -->」标出
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../miniprogram')
const KEYWORDS = new Set(['true', 'false', 'null', 'undefined'])

function wxmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'miniprogram_npm' ? [] : wxmlFiles(path)
    return entry.name.endsWith('.wxml') ? [path] : []
  })
}

// 去掉字符串、对象字面量的键和展开号后，取不在「.」后面的标识符
function identifiersOf(expression: string): string[] {
  const bare = expression
    .replace(/'[^']*'|"[^"]*"/g, ' ')
    .replace(/\.\.\./g, ' ')
    .replace(/(^|[,{])\s*[A-Za-z_$][\w$]*\s*:/g, '$1')
  return [...bare.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)]
    .map((match) => match[0])
    .filter((name) => !KEYWORDS.has(name))
}

function expressionsOf(source: string): string[] {
  return [...source.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((match) => match[1] ?? '')
}

interface Definition {
  file: string
  used: Set<string>
}

function definitionsOf(files: string[]): Map<string, Definition> {
  const definitions = new Map<string, Definition>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const modules = [...source.matchAll(/<wxs[^>]*module="([\w$]+)"/g)].map((m) => m[1])
    for (const match of source.matchAll(/<template name="([\w-]+)">([\s\S]*?)<\/template>/g)) {
      const [, name = '', body = ''] = match
      // 模板里「<!-- 可不传：a、b（说明） -->」标出的可选变量，调用处不传就是不显示
      const optional = /<!-- 可不传：([^（-]*)/.exec(body)?.[1]?.split('、') ?? []
      const local = new Set(['item', 'index', ...modules, ...optional.map((id) => id.trim())])
      for (const m of body.matchAll(/wx:for-(?:item|index)="([\w$]+)"/g)) local.add(m[1] ?? '')
      const used = new Set(
        expressionsOf(body)
          .flatMap(identifiersOf)
          .filter((id) => !local.has(id)),
      )
      definitions.set(name, { file: relative(ROOT, file), used })
    }
  }
  return definitions
}

// 只核对列名单的调用；带「...」展开的传什么由对象决定，静态看不出
function passedOf(data: string): Set<string> | null {
  if (data.includes('...')) return null
  return new Set(
    data
      .split(',')
      .map((part) => part.split(':')[0]?.trim() ?? '')
      .filter(Boolean),
  )
}

describe('WXML 模板调用传齐变量', () => {
  const files = wxmlFiles(ROOT)
  const definitions = definitionsOf(files)

  it('找得到模板定义', () => {
    expect(definitions.size).toBeGreaterThan(10)
  })

  it('每个列名单的调用都传齐了模板用到的变量', () => {
    const missing: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(
        /<template\b[^>]*\bis="([\w-]+)"[^>]*\bdata="\{\{([\s\S]*?)\}\}"/g,
      )) {
        const [, name = '', data = ''] = match
        const definition = definitions.get(name)
        const passed = passedOf(data)
        if (!definition || !passed) continue
        const lost = [...definition.used].filter((id) => !passed.has(id))
        if (lost.length) missing.push(`${relative(ROOT, file)} → ${name}：${lost.join('、')}`)
      }
    }
    expect(missing).toEqual([])
  })
})
