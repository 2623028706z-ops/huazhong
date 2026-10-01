// 表单里边输入边显示的金额（00 章第 1 节例外）：行金额、合计只做预览，提交后以后端为准。
// 单价输入框里是元（最多两位小数），提交的是分
const CENTS_PER_YUAN = 100
const DECIMALS = 2
const YUAN_TEXT = /^\d+(\.\d{0,2})?$/

// 「12.5」→ 1250；空或格式不对为 null，交给 Zod 规则写专门的提示
export function centsOfText(text: string): number | null {
  const trimmed = text.trim()
  if (!YUAN_TEXT.test(trimmed)) return null
  const [yuan = '0', fen = ''] = trimmed.split('.')
  return Number(yuan) * CENTS_PER_YUAN + Number(fen.padEnd(DECIMALS, '0'))
}

// 1250 → 「12.50」（单价输入框的初始值）
export function textOfCents(cents: number): string {
  return (cents / CENTS_PER_YUAN).toFixed(DECIMALS)
}

export function lineCents(qty: number, priceCents: number | null): number {
  return qty * (priceCents ?? 0)
}

export function sumCents<T>(items: readonly T[], cents: (item: T) => number): number {
  return items.reduce((sum, item) => sum + cents(item), 0)
}
