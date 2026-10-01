import { describe, expect, it } from 'vitest'
import { centsOfText, lineCents, sumCents, textOfCents } from '../miniprogram/core/money'

describe('单价输入和金额预览', () => {
  it('元换成分：整数、一位、两位小数', () => {
    expect(centsOfText('12')).toBe(1200)
    expect(centsOfText('12.5')).toBe(1250)
    expect(centsOfText(' 0.05 ')).toBe(5)
    expect(centsOfText('0')).toBe(0)
  })

  it('空、三位小数、负数、非数字算没填，交给 Zod 写提示', () => {
    expect(centsOfText('')).toBeNull()
    expect(centsOfText('1.234')).toBeNull()
    expect(centsOfText('-1')).toBeNull()
    expect(centsOfText('abc')).toBeNull()
  })

  it('分换回输入框里的文字', () => {
    expect(textOfCents(6800)).toBe('68.00')
    expect(textOfCents(5)).toBe('0.05')
  })

  it('行金额按数量乘单价，单价没填按 0 预览；合计逐行加', () => {
    expect(lineCents(3, 6800)).toBe(20400)
    expect(lineCents(3, null)).toBe(0)
    expect(sumCents([{ c: 100 }, { c: 250 }], (item) => item.c)).toBe(350)
  })
})
