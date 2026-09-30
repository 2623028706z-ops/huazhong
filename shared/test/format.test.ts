import { describe, expect, it } from 'vitest'
import {
  formatCardDate,
  formatMoney,
  formatNavDate,
  formatQty,
  formatTime,
  maskPhone,
  shanghaiDateOf,
} from '../src/format.ts'

describe('金额按分显示成元', () => {
  it('0 分显示 ¥0.00', () => {
    expect(formatMoney(0)).toBe('¥0.00')
  })
  it('123450 分显示 ¥1,234.50', () => {
    expect(formatMoney(123450)).toBe('¥1,234.50')
  })
  it('百万级金额每三位一个逗号', () => {
    expect(formatMoney(123456789)).toBe('¥1,234,567.89')
  })
  it('负数前面加减号', () => {
    expect(formatMoney(-13600)).toBe('−¥136.00')
  })
  it('个位分数补零', () => {
    expect(formatMoney(5)).toBe('¥0.05')
  })
})

describe('数量带单位', () => {
  it('15 束', () => {
    expect(formatQty(15, '束')).toBe('15 束')
  })
})

describe('卡片日期', () => {
  it('今年的只写月-日', () => {
    expect(formatCardDate('2026-09-28', '2026-09-30')).toBe('09-28')
  })
  it('往年的写全', () => {
    expect(formatCardDate('2025-12-31', '2026-09-30')).toBe('2025-12-31')
  })
})

describe('时间按上海时间显示', () => {
  it('UTC 00:10 是上海 08:10', () => {
    expect(formatTime('2026-09-30T00:10:00.000Z')).toBe('2026-09-30 08:10')
  })
  it('UTC 15:59 还是上海当天 23:59', () => {
    expect(formatTime('2026-09-29T15:59:00.000Z')).toBe('2026-09-29 23:59')
  })
  it('UTC 16:00 已经是上海第二天 00:00', () => {
    expect(formatTime('2026-09-29T16:00:00.000Z')).toBe('2026-09-30 00:00')
  })
  it('跨年', () => {
    expect(formatTime('2025-12-31T16:30:00.000Z')).toBe('2026-01-01 00:30')
  })
  it('闰年 2 月 29 日', () => {
    expect(formatTime('2028-02-28T16:00:00.000Z')).toBe('2028-02-29 00:00')
  })
})

describe('顶栏日期', () => {
  it('2026-09-30 是周三', () => {
    expect(formatNavDate('2026-09-30')).toBe('2026.09.30 周三')
  })
  it('1970-01-01 是周四', () => {
    expect(formatNavDate('1970-01-01')).toBe('1970.01.01 周四')
  })
  it('1969-12-28 是周日（1970 年以前也对）', () => {
    expect(formatNavDate('1969-12-28')).toBe('1969.12.28 周日')
  })
})

describe('某个时刻在上海是哪一天', () => {
  it('UTC 15:59:59 还是当天', () => {
    expect(shanghaiDateOf(Date.UTC(2026, 8, 29, 15, 59, 59))).toBe('2026-09-29')
  })
  it('UTC 16:00 算第二天', () => {
    expect(shanghaiDateOf(Date.UTC(2026, 8, 29, 16, 0, 0))).toBe('2026-09-30')
  })
})

describe('手机号打码', () => {
  it('11 位中间四位打码', () => {
    expect(maskPhone('13800138001')).toBe('138****8001')
  })
  it('不是 11 位原样显示', () => {
    expect(maskPhone('12345')).toBe('12345')
  })
})
