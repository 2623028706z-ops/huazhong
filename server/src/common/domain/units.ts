// 卡片第 2 行的总数：按单位合计，顺序照明细里第一次出现（前端 formatUnitTotals 显示）
import type { UnitTotal } from '@huazhong/shared'

export function unitTotalsOf(lines: readonly { unit: string; qty: number }[]): UnitTotal[] {
  const totals = new Map<string, number>()
  for (const line of lines) totals.set(line.unit, (totals.get(line.unit) ?? 0) + line.qty)
  return [...totals].map(([unit, qty]) => ({ unit, qty }))
}

export function sumOf<T>(items: readonly T[], valueOf: (item: T) => number): number {
  return items.reduce((sum, item) => sum + valueOf(item), 0)
}
