// 显示格式（02 章第 6 节）。前端、后端、WXS 共用这一份：
// scripts/gen-wxs 把本文件原样转成 miniapp/miniprogram/core/format.wxs，
// 所以只能用 WXS 支持的写法（ESLint 检查）：不用 Date、正则、模板字符串、解构、默认参数，只导出函数。
// 业务日期、时间都按 Asia/Shanghai（UTC+8，没有夏令时）换算，只用整数运算。

const SHANGHAI_OFFSET_MINUTES = 8 * 60
const MS_PER_MINUTE = 60 * 1000
const MINUTES_PER_DAY = 24 * 60
const WEEK_PREFIX = '周'
const WEEKDAY_NAMES = '日一二三四五六'
const YUAN = '¥'
const MINUS = '−'
const COUNT_MAX = 99

function pad2(value: number): string {
  return value < 10 ? '0' + value : '' + value
}

// 公历日期 ↔ 1970-01-01 起的天数（Howard Hinnant 的 days_from_civil / civil_from_days）
function daysFromCivil(year: number, month: number, day: number): number {
  const shifted = month <= 2 ? year - 1 : year
  const era = Math.floor(shifted / 400)
  const yearOfEra = shifted - era * 400
  const monthIndex = month > 2 ? month - 3 : month + 9
  const dayOfYear = Math.floor((153 * monthIndex + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function civilFromDays(days: number): string {
  const shifted = days + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  )
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
  return year + '-' + pad2(month) + '-' + pad2(day)
}

function daysOfDate(date: string): number {
  return daysFromCivil(
    parseInt(date.slice(0, 4), 10),
    parseInt(date.slice(5, 7), 10),
    parseInt(date.slice(8, 10), 10),
  )
}

// ISO 8601 UTC 时间戳（例如 2026-09-30T00:10:00.000Z）→ 上海时间的分钟数
function shanghaiMinutesOf(timestamp: string): number {
  const days = daysOfDate(timestamp.slice(0, 10))
  const hours = parseInt(timestamp.slice(11, 13), 10)
  const minutes = parseInt(timestamp.slice(14, 16), 10)
  return days * MINUTES_PER_DAY + hours * 60 + minutes + SHANGHAI_OFFSET_MINUTES
}

// 某个时刻在上海是哪一天，YYYY-MM-DD。「今天」= shanghaiDateOf(Date.now())
export function shanghaiDateOf(epochMs: number): string {
  const minutes = Math.floor(epochMs / MS_PER_MINUTE) + SHANGHAI_OFFSET_MINUTES
  return civilFromDays(Math.floor(minutes / MINUTES_PER_DAY))
}

// 金额：分 → ¥1,234.50；负数前面加「−」，例如 −¥136.00
export function formatMoney(cents: number): string {
  const sign = cents < 0 ? MINUS : ''
  const absolute = Math.abs(cents)
  const fen = absolute % 100
  let yuan = '' + Math.floor(absolute / 100)
  let grouped = ''
  while (yuan.length > 3) {
    grouped = ',' + yuan.slice(yuan.length - 3) + grouped
    yuan = yuan.slice(0, yuan.length - 3)
  }
  return sign + YUAN + yuan + grouped + '.' + pad2(fen)
}

// 数量：15 束
export function formatQty(qty: number, unit: string): string {
  return qty + ' ' + unit
}

// 和 copy.separator 同一个写法（本文件会转成 WXS，不能 import）
const UNIT_SEPARATOR = ' · '

// 卡片第 2 行的总数：后端按单位合计好（顺序照明细里第一次出现），例如「32 束 · 4 盆」
export function formatUnitTotals(totals: { unit: string; qty: number }[]): string {
  let text = ''
  for (let i = 0; i < totals.length; i += 1) {
    const total = totals[i]
    if (total === undefined) continue
    text = text + (i > 0 ? UNIT_SEPARATOR : '') + formatQty(total.qty, total.unit)
  }
  return text
}

// 卡片、列表里的日期：今年的写 月-日，不是今年的写全
export function formatCardDate(date: string, today: string): string {
  return date.slice(0, 4) === today.slice(0, 4) ? date.slice(5) : date
}

// 一天里的第几分钟 → 时:分
function clockOf(minutes: number): string {
  const minuteOfDay = minutes - Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY
  return pad2(Math.floor(minuteOfDay / 60)) + ':' + pad2(minuteOfDay % 60)
}

// YYYY-MM-DD → 周几
function weekdayOf(date: string): string {
  const weekday = (((daysOfDate(date) + 4) % 7) + 7) % 7
  return WEEK_PREFIX + WEEKDAY_NAMES.charAt(weekday)
}

// 时间戳在上海是哪一天，YYYY-MM-DD（列表按天分组）
export function shanghaiDayOf(timestamp: string): string {
  return civilFromDays(Math.floor(shanghaiMinutesOf(timestamp) / MINUTES_PER_DAY))
}

// 时间：年-月-日 时:分（上海时间）
export function formatTime(timestamp: string): string {
  return shanghaiDayOf(timestamp) + ' ' + clockOf(shanghaiMinutesOf(timestamp))
}

// 分组里的时间：时:分（上海时间）
export function formatClock(timestamp: string): string {
  return clockOf(shanghaiMinutesOf(timestamp))
}

// 顶栏日期：2026.09.30 周三
export function formatNavDate(date: string): string {
  const dotted = date.slice(0, 4) + '.' + date.slice(5, 7) + '.' + date.slice(8, 10)
  return dotted + ' ' + weekdayOf(date)
}

// 列表分组头：今年的写 月-日 周几，不是今年的写全
export function formatDayHeader(date: string, today: string): string {
  return formatCardDate(date, today) + ' ' + weekdayOf(date)
}

// 业务日期往后（负数往前）挪几天：近 7 天 = addDays(today, -6) 到 today
export function addDays(date: string, days: number): string {
  return civilFromDays(daysOfDate(date) + days)
}

// 这个月 1 号
export function monthStartOf(date: string): string {
  return date.slice(0, 8) + '01'
}

// 筛选栏状态标签后的数量：超过 99 写 99+
export function formatCount(count: number): string {
  return count > COUNT_MAX ? COUNT_MAX + '+' : '' + count
}

// 手机号：列表里中间四位打码
export function maskPhone(phone: string): string {
  return phone.length === 11 ? phone.slice(0, 3) + '****' + phone.slice(7) : phone
}
