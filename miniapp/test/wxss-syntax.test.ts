// WXSS 静态核对：样式文件里有一处编译不过，整个小程序白屏、上传也被拒。
// 2026-10-05 utils.wxss 写了通配选择器 `+ *`，开发者工具报「编译 .wxss 文件错误」，登录页都进不去
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../miniprogram')

function wxssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'miniprogram_npm' ? [] : wxssFiles(path)
    return entry.name.endsWith('.wxss') ? [path] : []
  })
}

// 只看选择器部分（花括号外），去掉注释
function selectors(file: string): string[] {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{/g)].map(([, selector = '']) => selector.trim())
}

describe('样式文件能被开发者工具编译', () => {
  it('选择器里不用通配符 *（WXSS 不支持）', () => {
    const bad = wxssFiles(ROOT).flatMap((file) =>
      selectors(file)
        .filter((selector) => selector.includes('*'))
        .map((selector) => `${relative(ROOT, file)}: ${selector}`),
    )
    expect(bad).toEqual([])
  })
})
