// 列表顶层的状态计数（05 章第 1.3 节）：只含等待类状态，没有的记 0
export function waitCounts<S extends string>(
  codes: readonly S[],
  rows: readonly { status: string; count: number }[],
): Partial<Record<S, number>> {
  const counts: Partial<Record<S, number>> = {}
  for (const code of codes) counts[code] = rows.find((row) => row.status === code)?.count ?? 0
  return counts
}
