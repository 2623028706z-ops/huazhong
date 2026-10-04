import { copy, formatMoney, type LogDetail } from '@huazhong/shared'

export function logViewOf(value: unknown): LogDetail['after'] {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value))
    return { [copy.log.changes]: typeof value === 'string' ? value : JSON.stringify(value) }
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key,
      typeof field === 'string' ? field : JSON.stringify(field),
    ]),
  )
}

export function priceChangesText(
  changes: readonly { name: string; fromCents: number; toCents: number }[],
): string {
  return changes
    .map((change) =>
      copy.order.change.price(
        change.name,
        formatMoney(change.fromCents),
        formatMoney(change.toCents),
      ),
    )
    .join(copy.separator)
}
