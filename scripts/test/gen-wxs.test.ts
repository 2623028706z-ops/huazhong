import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as format from '../../shared/src/format.ts'
import { formatSource, toWxs, wxsOutput } from '../src/gen-wxs.ts'

type FormatModule = typeof format

// 模拟 WXS 环境：没有 Date、RegExp，只有 Math、parseInt
function runWxs(code: string): FormatModule {
  const sandbox = { module: { exports: {} }, Date: undefined, RegExp: undefined }
  vm.runInNewContext(code, sandbox)
  return sandbox.module.exports as FormatModule
}

const wxs = runWxs(toWxs(readFileSync(formatSource, 'utf8')))

const moneySamples = [0, 5, 123450, 123456789, -13600]
const timeSamples = [
  '2026-09-30T00:10:00.000Z',
  '2026-09-29T15:59:00.000Z',
  '2025-12-31T16:30:00.000Z',
]
const dateSamples = ['2026-09-30', '1970-01-01', '1969-12-28', '2028-02-29']

describe('生成的 format.wxs 和 shared/src/format.ts 结果一致', () => {
  it('金额', () => {
    for (const cents of moneySamples) expect(wxs.formatMoney(cents)).toBe(format.formatMoney(cents))
  })
  it('时间', () => {
    for (const timestamp of timeSamples)
      expect(wxs.formatTime(timestamp)).toBe(format.formatTime(timestamp))
  })
  it('顶栏日期和卡片日期', () => {
    for (const date of dateSamples) {
      expect(wxs.formatNavDate(date)).toBe(format.formatNavDate(date))
      expect(wxs.formatCardDate(date, '2026-09-30')).toBe(format.formatCardDate(date, '2026-09-30'))
    }
  })
  it('数量、手机号、上海日期', () => {
    expect(wxs.formatQty(15, '束')).toBe(format.formatQty(15, '束'))
    expect(wxs.maskPhone('13800138001')).toBe(format.maskPhone('13800138001'))
    const epoch = 1_790_000_000_000
    expect(wxs.shanghaiDateOf(epoch)).toBe(format.shanghaiDateOf(epoch))
  })
})

describe('生成规则', () => {
  it('导出 format.ts 的全部函数', () => {
    expect(Object.keys(wxs).sort()).toEqual(Object.keys(format).sort())
  })
  it('用了 WXS 不支持的写法就报错', () => {
    expect(() => toWxs('export function now(): number { return Date.now() }')).toThrow(/Date/)
  })
  it('已提交的 format.wxs 是最新的', () => {
    expect(readFileSync(wxsOutput.file, 'utf8')).toBe(wxsOutput.fingerprint)
  })
})
