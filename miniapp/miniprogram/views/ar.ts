// 发货单收款情况的卡片（06 章 S9、F3）：门店写未付 / 部分付 / 已付，财务写未收 / 部分收 / 已收
import { copy, formatMoney, formatUnitTotals, type ArCard } from '@huazhong/shared'

export function arRowOf(card: ArCard, forStore: boolean) {
  const unpaid = forStore ? copy.screen.storeUnpaid : copy.screen.arUnpaid
  const parts = [card.orderNo]
  if (card.payStatus === 'partial') parts.push(unpaid(formatMoney(card.unpaidCents)))
  return {
    id: card.orderId,
    date: card.shipDate,
    status: card.payStatus,
    title: card.storeName,
    total: formatUnitTotals(card.units),
    meta: parts.join(copy.separator),
    amount: card.receivableCents,
    amountText: '',
    tags: card.offsetByAfter ? [{ text: copy.screen.tag.offset, warn: false }] : [],
  }
}
