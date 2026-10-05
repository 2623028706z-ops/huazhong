// 列表卡（02 章第 4 节 hz-card、第 6 节第 18 条，2026-10-06 第 4 批）：大字一个认单依据，
// 下面一行小字用「 · 」连起来（不写字段名、零值空值不写），右边状态标签 + 金额（或一个数）
import { copy, formatMoney, formatNavDate, shanghaiDateOf } from '@huazhong/shared'

interface Tag {
  text: string
  warn: boolean
  danger?: boolean
}

export interface CardRow {
  id: string
  // 大字；serif 为 true 时用宋体（日期、对账期间这类数字），否则黑体加粗（客户门店、供应商）
  main: string
  serif?: boolean
  // 小字：已用「 · 」连好
  sub: string
  // 标题前的小红点（门店没看过的结果）
  dot?: boolean
  // 右上：状态码（配合列表的 statusKind）、文字（发货卡出货日期，late 标红）
  status?: string
  side?: string
  late?: boolean
  // 右下：金额（宋体）和金额下面的小字（未收、多收、配货 n/m 种）
  amount?: string
  note?: string
  // 改单、改价、取消申请中、逾期、有差异这类标记：小字下面一行，没有不占地方
  tags?: Tag[]
}

// 小字多项之间
export const CARD_SEPARATOR = ' · '

export function subOf(parts: readonly (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(CARD_SEPARATOR)
}

// YYYY-MM-DD 里年份的长度；今年的日期去掉「YYYY-」
const YEAR_LENGTH = 4

// 列表卡日期：今年「09-28 周日」，往年「2025-12-28 周日」（详情、弹层仍写完整日期）
export function cardDateOf(date: string, today = shanghaiDateOf(Date.now())): string {
  const full = formatNavDate(date)
  return date.slice(0, YEAR_LENGTH) === today.slice(0, YEAR_LENGTH)
    ? full.slice(YEAR_LENGTH + 1)
    : full
}

// 金额：0 和没有都不显示
export function cardAmountOf(cents: number | null | undefined): string {
  return cents ? formatMoney(cents) : ''
}

// 第一种 + 「等 n 项」，没有就空
export function summaryOf(names: readonly string[]): string {
  const [first] = names
  if (!first) return ''
  return names.length > 1 ? copy.order.moreItems(first, names.length) : first
}

// 「出货 09-28 周日」；还没定写「出货日期待定」
export function shipOnOf(shipDate: string | null): string {
  return shipDate ? copy.flow.common.shipOn(cardDateOf(shipDate)) : copy.flow.common.shipDateTbd
}
