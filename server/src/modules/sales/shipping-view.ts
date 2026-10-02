import {
  contract,
  copy,
  type OrderCard,
  type OrderDetail,
  type ShippingCard,
  type ShippingDetail,
} from '@huazhong/shared'
export function shippingCard(card: OrderCard): ShippingCard {
  return contract.listShippingOrders.response.shape.items.element.strip().parse({
    ...card,
    actions: card.actions.filter((action) => action.code === 'ship'),
    lockedReason: null,
  })
}
export function shippingDetail(detail: OrderDetail): ShippingDetail {
  return contract.getShippingOrder.response.strip().parse({
    ...detail,
    actions: detail.actions.filter((action) => action.code === 'ship'),
    lockedReason: null,
    lines: detail.lines.map((line) =>
      contract.getShippingOrder.response.shape.lines.element.strip().parse(line),
    ),
    changes: detail.changes.map((change) => ({
      ...change,
      items: change.items.filter(
        (item) =>
          !item.includes(copy.screen.label.price) &&
          !item.includes(copy.field.amount) &&
          !/[¥￥]/.test(item),
      ),
    })),
  })
}
