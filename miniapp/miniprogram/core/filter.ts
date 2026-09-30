// 筛选栏的条件（02 章第 4 节 hz-filter-bar）：纯函数，组件和页面都用这一份。
// 日期按 Asia/Shanghai 算：近 7 天 = 今天往前 6 天到今天，本月 = 本月 1 号到今天。
import { addDays, copy, formatCardDate, monthStartOf, statusOf } from '@huazhong/shared'

const datePresets = ['all', 'today', 'last7Days', 'thisMonth', 'custom'] as const
export type DatePreset = (typeof datePresets)[number]

export interface DateRange {
  from: string
  to: string
}

interface FilterOption {
  id: string
  name: string
}

// 对象筛选：客户、供应商、门店、花材、分类、模块、类型
export interface FilterDimension {
  key: string
  // 对象名，例如「客户」：拼出「全部客户」「选择客户」「搜索客户」
  label: string
  options: FilterOption[]
}

// type 而不是 interface：组件的 Object 属性要求能赋给 Record<string, any>
export type FilterValue = {
  // '' = 全部
  status: string
  keyword: string
  date: DatePreset
  // 只有 date 为 custom 时有值，而且起止都选好了才会是 custom
  range: DateRange | null
  // 对象 key → 选中的 id，没选就没有这个 key
  picks: Record<string, string>
}

interface FilterChip {
  // 'date' 或对象的 key
  key: string
  text: string
}

// 列表接口用的条件：日期换成起止，没设的不传
interface FilterQuery {
  status: string | null
  keyword: string | null
  dateFrom: string | null
  dateTo: string | null
  picks: Record<string, string>
}

const DATE_KEY = 'date'
const LAST_7_DAYS_BACK = -6

export const emptyFilter: FilterValue = {
  status: '',
  keyword: '',
  date: 'all',
  range: null,
  picks: {},
}

export function rangeOf(value: FilterValue, today: string): DateRange | null {
  switch (value.date) {
    case 'all':
      return null
    case 'today':
      return { from: today, to: today }
    case 'last7Days':
      return { from: addDays(today, LAST_7_DAYS_BACK), to: today }
    case 'thisMonth':
      return { from: monthStartOf(today), to: today }
    case 'custom':
      return value.range
  }
}

// 自定义日期段写「09-01 至 09-15」（今年的只写月-日）
function rangeText(range: DateRange, today: string): string {
  return copy.filter.range(formatCardDate(range.from, today), formatCardDate(range.to, today))
}

function dateChip(value: FilterValue, today: string): FilterChip | null {
  if (value.date === 'all') return null
  if (value.date === 'custom') {
    return value.range ? { key: DATE_KEY, text: rangeText(value.range, today) } : null
  }
  return { key: DATE_KEY, text: copy.filter[value.date] }
}

// 条件胶囊：日期在前，对象按 dimensions 的顺序
export function chipsOf(
  value: FilterValue,
  dimensions: FilterDimension[],
  today: string,
): FilterChip[] {
  const chips: FilterChip[] = []
  const date = dateChip(value, today)
  if (date) chips.push(date)
  for (const dimension of dimensions) {
    const picked = dimension.options.find((option) => option.id === value.picks[dimension.key])
    if (picked) chips.push({ key: dimension.key, text: picked.name })
  }
  return chips
}

// 筛选按钮上的圆点：设了日期或对象条件（状态、搜索不算）
export function hasConditions(value: FilterValue): boolean {
  return value.date !== 'all' || Object.keys(value.picks).length > 0
}

// 点胶囊的 ×：去掉这一项
export function removeChip(value: FilterValue, key: string): FilterValue {
  if (key === DATE_KEY) return { ...value, date: 'all', range: null }
  const picks = Object.fromEntries(Object.entries(value.picks).filter(([name]) => name !== key))
  return { ...value, picks }
}

// 点「清除」：去掉全部日期和对象条件，不动状态和搜索
export function clearConditions(value: FilterValue): FilterValue {
  return { ...value, date: 'all', range: null, picks: {} }
}

// 选对象：选「全部」（id 为 ''）等于去掉这一项
export function pick(value: FilterValue, key: string, id: string): FilterValue {
  if (id === '') return removeChip(value, key)
  return { ...value, picks: { ...value.picks, [key]: id } }
}

export interface StatusTab {
  code: string
  text: string
  // 只有等待类状态、而且大于 0 才有数
  count: number
}

// 状态标签行：「全部」+ 各状态；数量来自列表接口的 counts（只含等待类）
export function tabsOf(kind: string, codes: string[], counts: Record<string, number>): StatusTab[] {
  const tabs: StatusTab[] = [{ code: '', text: copy.filter.all, count: 0 }]
  for (const code of codes) {
    const status = statusOf(kind, code)
    if (!status) continue
    const count = status.tone === 'wait' ? (counts[code] ?? 0) : 0
    tabs.push({ code, text: status.text, count })
  }
  return tabs
}

// 弹层里的日期分段；自定义选好后这格写起止
export function segmentsOf(value: FilterValue, today: string): { key: DatePreset; text: string }[] {
  return datePresets.map((key) => ({
    key,
    text: key === 'custom' && value.range ? rangeText(value.range, today) : copy.filter[key],
  }))
}

// 弹层里的对象行：左边「客户」，右边「全部客户 ›」
export function dimensionRowsOf(
  value: FilterValue,
  dimensions: FilterDimension[],
): { key: string; label: string; text: string }[] {
  return dimensions.map((dimension) => {
    const picked = dimension.options.find((option) => option.id === value.picks[dimension.key])
    return {
      key: dimension.key,
      label: dimension.label,
      text: picked?.name ?? copy.filter.allOf(dimension.label),
    }
  })
}

// 单选列表：第一项「全部客户」（id 为 ''），按名称搜索
export function optionRowsOf(
  dimension: FilterDimension,
  pickedId: string,
  keyword: string,
): { id: string; name: string; picked: boolean }[] {
  const word = keyword.trim()
  const all = { id: '', name: copy.filter.allOf(dimension.label) }
  const matched = dimension.options.filter((option) => option.name.includes(word))
  return [all, ...matched].map((option) => ({ ...option, picked: option.id === pickedId }))
}

export function queryOf(value: FilterValue, today: string): FilterQuery {
  const range = rangeOf(value, today)
  return {
    status: value.status || null,
    keyword: value.keyword.trim() || null,
    dateFrom: range?.from ?? null,
    dateTo: range?.to ?? null,
    picks: value.picks,
  }
}
