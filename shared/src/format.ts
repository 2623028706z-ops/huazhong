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

// 卡片、列表里的日期：今年的写 月-日，不是今年的写全
export function formatCardDate(date: string, today: string): string {
  return date.slice(0, 4) === today.slice(0, 4) ? date.slice(5) : date
}

// 时间：年-月-日 时:分（上海时间）
export function formatTime(timestamp: string): string {
  const minutes = shanghaiMinutesOf(timestamp)
  const days = Math.floor(minutes / MINUTES_PER_DAY)
  const minuteOfDay = minutes - days * MINUTES_PER_DAY
  return (
    civilFromDays(days) + ' ' + pad2(Math.floor(minuteOfDay / 60)) + ':' + pad2(minuteOfDay % 60)
  )
}

// 顶栏日期：2026.09.30 周三
export function formatNavDate(date: string): string {
  const weekday = (((daysOfDate(date) + 4) % 7) + 7) % 7
  const dotted = date.slice(0, 4) + '.' + date.slice(5, 7) + '.' + date.slice(8, 10)
  return dotted + ' ' + WEEK_PREFIX + WEEKDAY_NAMES.charAt(weekday)
}

// 手机号：列表里中间四位打码
export function maskPhone(phone: string): string {
  return phone.length === 11 ? phone.slice(0, 3) + '****' + phone.slice(7) : phone
}
